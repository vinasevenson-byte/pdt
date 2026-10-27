/**
 * Cloud Functions Callables — Módulo Remessa PIX / CNAB 240 Pagamentos (financeiro/remessa)
 * - gerarRemessaPagamento: agrupa títulos Aprovados (/contas_pagar) em um lote CNAB 240 e trava inclusão duplicada
 * - processarRetornoRemessa: liquida repasses/antecipações confirmados ("00") gerando Ledger (respeitando /fechamentos)
 *   e libera títulos rejeitados ("RJ"/"DV") sem corromper saldos
 */
'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  obterDataAtualBR,
  obterCompetenciaAtualBR,
  competenciaEstaFechada,
  registrarAuditoria,
  temPermissao,
  publicarEventoDominio
} = require('../../../../services/functions/src/shared/recalculo');
const {
  executarDecidirRepasse,
  executarDecidirAntecipacao
} = require('../../../../services/functions/src/callables');
const { gerarLoteRemessaPagamento, parsearRetornoCNAB240 } = require('../domain');

const { onCall, HttpsError } = httpsV2;

async function executarGerarRemessaPagamento(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'repasse:pagar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas operadores com permissão "repasse:pagar" podem gerar remessa bancária CNAB 240/PIX.'
    );
  }

  const { tituloIds, codigoBanco = '341', produtoraId = 'disk_matriz' } = request.data || {};
  const [cpSnap, repSnap, contasSnap, remSnap] = await Promise.all([
    customDb.ref('/contas_pagar').get(),
    customDb.ref('/repasses').get(),
    customDb.ref('/contas').get(),
    customDb.ref('/remessas').get()
  ]);

  const todosCp = (cpSnap && cpSnap.val()) || {};
  const repasses = (repSnap && repSnap.val()) || {};
  const contasPorProdutora = (contasSnap && contasSnap.val()) || {};
  const remessasExistentes = (remSnap && remSnap.val()) || {};

  const listaCandidatos = Array.isArray(tituloIds) && tituloIds.length > 0
    ? tituloIds.map(id => (todosCp[id] ? { ...todosCp[id], id } : null)).filter(Boolean)
    : Object.entries(todosCp)
        .filter(([, t]) => t && t.status === 'Aprovada' && !t.remessaId)
        .map(([id, t]) => ({ ...t, id }));

  if (listaCandidatos.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'Nenhum título em /contas_pagar elegível (status "Aprovada" e sem remessa ativa) encontrado.'
    );
  }

  const numeroSequencial = Object.keys(remessasExistentes).length + 1;
  const dataGeracao = obterDataAtualBR(nowDate);

  const lote = gerarLoteRemessaPagamento({
    numeroSequencial,
    codigoBanco,
    titulos: listaCandidatos,
    repasses,
    contasPorProdutora,
    dataGeracao
  });

  if (lote.quantidadeItens === 0) {
    throw new HttpsError(
      'failed-precondition',
      `Nenhum título passou na validação bancária: ${lote.rejeitadosNaTriagem.map(r => `${r.tituloId} (${r.motivo})`).join(' | ')}`
    );
  }

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const remRef = customDb.ref('/remessas').push();
  const remessaId = remRef.key;

  const registroRemessa = {
    id: remessaId,
    produtoraId,
    numeroSequencial: lote.numeroSequencial,
    codigoBanco: lote.codigoBanco,
    dataGeracao: lote.dataGeracao,
    quantidadeItens: lote.quantidadeItens,
    valorTotalCents: lote.valorTotalCents,
    valorTotal: lote.valorTotal,
    itens: lote.itens,
    rejeitadosNaTriagem: lote.rejeitadosNaTriagem,
    cnab240: lote.cnab240,
    hashRemessa: lote.hashRemessa,
    status: 'Gerada',
    geradoPor: usuario,
    geradoEm: agora
  };

  const updates = {
    [`/remessas/${remessaId}`]: registroRemessa
  };
  for (const item of lote.itens) {
    updates[`/contas_pagar/${item.tituloId}/remessaId`] = remessaId;
  }

  await customDb.ref().update(updates);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'financeiro/remessa',
      eventoId: remessaId,
      acao: 'Geração de Remessa CNAB 240 / PIX',
      resumo: `Remessa ${remessaId} (#${lote.numeroSequencial}) gerada com ${lote.quantidadeItens} título(s), total R$ ${lote.valorTotal.toFixed(2)}.`
    },
    customDb
  );

  await publicarEventoDominio(customDb, {
    tipo: 'financeiro.remessa.processado',
    origemModulo: 'financeiro/remessa',
    referenciaId: remessaId,
    produtoraId,
    payload: {
      remessaId,
      quantidadeItens: lote.quantidadeItens,
      valorTotalCents: lote.valorTotalCents,
      hashRemessa: lote.hashRemessa
    }
  });

  return registroRemessa;
}

async function executarProcessarRetornoRemessa(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'repasse:pagar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas operadores com permissão "repasse:pagar" podem processar arquivo de retorno bancário.'
    );
  }

  const { remessaId, retornoEntrada } = request.data || {};
  if (!remessaId || !retornoEntrada) {
    throw new HttpsError('invalid-argument', 'Informe remessaId e retornoEntrada (CNAB 240 ou lista de ocorrências).');
  }

  const [remSnap, fechSnap] = await Promise.all([
    customDb.ref(`/remessas/${remessaId}`).get(),
    customDb.ref('/fechamentos').get()
  ]);

  if (!remSnap.exists()) {
    throw new HttpsError('not-found', `Remessa ${remessaId} não encontrada.`);
  }

  const remessa = remSnap.val();
  if (remessa.status === 'Processada') {
    throw new HttpsError('failed-precondition', `A remessa ${remessaId} já foi integralmente processada.`);
  }

  const competenciaAtual = obterCompetenciaAtualBR(nowDate);
  const fechamentosMap = (fechSnap && fechSnap.val()) || {};
  if (competenciaEstaFechada(competenciaAtual, fechamentosMap)) {
    throw new HttpsError(
      'failed-precondition',
      `A competência ${competenciaAtual} está encerrada em /fechamentos e bloqueia liquidações de retorno bancário.`
    );
  }

  const itensRetorno = parsearRetornoCNAB240(retornoEntrada);
  const mapaRetorno = new Map(itensRetorno.map(i => [i.tituloId, i]));

  const liquidados = [];
  const rejeitadosBanco = [];
  const itensAtualizados = [];

  for (const item of remessa.itens || []) {
    const ret = mapaRetorno.get(item.tituloId);
    if (!ret) {
      itensAtualizados.push(item);
      continue;
    }

    if (ret.liquidado) {
      if (item.repasseId) {
        await executarDecidirRepasse(
          {
            auth,
            data: {
              repasseId: item.repasseId,
              acao: 'pagar',
              protocoloBancario: ret.protocoloBancario
            }
          },
          { db: customDb, nowDate }
        );
      } else if (item.antecipacaoId) {
        await executarDecidirAntecipacao(
          {
            auth,
            data: {
              antId: item.antecipacaoId,
              acao: 'pagar',
              protocoloBancario: ret.protocoloBancario
            }
          },
          { db: customDb, nowDate }
        );
      }
      liquidados.push({
        tituloId: item.tituloId,
        protocoloBancario: ret.protocoloBancario,
        codigoOcorrencia: ret.codigoOcorrencia
      });
      itensAtualizados.push({
        ...item,
        statusItem: 'Liquidado',
        codigoOcorrencia: ret.codigoOcorrencia,
        protocoloBancario: ret.protocoloBancario
      });
    } else {
      // Rejeição bancária: libera o título de /contas_pagar para poder entrar em nova remessa sem corromper saldo!
      await customDb.ref(`/contas_pagar/${item.tituloId}`).update({
        remessaId: null,
        ultimoErroRemessa: ret.codigoOcorrencia
      });
      rejeitadosBanco.push({
        tituloId: item.tituloId,
        codigoOcorrencia: ret.codigoOcorrencia
      });
      itensAtualizados.push({
        ...item,
        statusItem: 'Rejeitado',
        codigoOcorrencia: ret.codigoOcorrencia
      });
    }
  }

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const statusFinal = rejeitadosBanco.length > 0 && liquidados.length === 0 ? 'Rejeitada' : 'Processada';

  const remessaAtualizada = {
    ...remessa,
    status: statusFinal,
    itens: itensAtualizados,
    resumoRetorno: {
      liquidados: liquidados.length,
      rejeitadosBanco: rejeitadosBanco.length
    },
    processadoPor: usuario,
    processadoEm: agora
  };

  await customDb.ref(`/remessas/${remessaId}`).set(remessaAtualizada);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'financeiro/remessa',
      eventoId: remessaId,
      acao: 'Processamento de Retorno CNAB 240 / PIX',
      resumo: `Retorno da remessa ${remessaId} processado: ${liquidados.length} liquidado(s), ${rejeitadosBanco.length} rejeitado(s).`
    },
    customDb
  );

  return {
    remessaId,
    status: statusFinal,
    liquidados,
    rejeitadosBanco
  };
}

exports.gerarRemessaPagamento = onCall(req => executarGerarRemessaPagamento(req));
exports.processarRetornoRemessa = onCall(req => executarProcessarRetornoRemessa(req));
exports.executarGerarRemessaPagamento = executarGerarRemessaPagamento;
exports.executarProcessarRetornoRemessa = executarProcessarRetornoRemessa;
