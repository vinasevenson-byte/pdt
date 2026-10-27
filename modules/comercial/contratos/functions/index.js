/**
 * Cloud Function Handler — Módulo Contratos, Negociações e Aditivos Versionados (comercial/contratos)
 * - `publicarVersaoContratoNegociacao`: valida termos comerciais e regras de borderô, grava versão imutável
 *   com selo SHA-256 em `/contratos/{eventoId}`, atualiza `/negociacoes/{eventoId}` e `/eventos_fin/{eventoId}`,
 *   publica projeção limpa em `/contratos_produtor/{produtoraId}/{eventoId}` e recalcula a produtora.
 */
'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  registrarAuditoria,
  recalcularTodaProdutora,
  temPermissao,
  publicarEventoDominio
} = require('../../../../services/functions/src/shared/recalculo');
const { validarContratos } = require('../contract');
const {
  validarTermosComerciaisEvento,
  gerarVersaoContratoAditivo
} = require('../domain');
const { onCall, HttpsError } = httpsV2;

async function executarPublicarVersaoContratoNegociacao(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || (!temPermissao(auth.token, 'contratos:gerenciar') && !temPermissao(auth.token, 'negociacoes:gerenciar'))) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "contratos:gerenciar" ou "negociacoes:gerenciar" podem publicar contratos e aditivos.'
    );
  }

  const dados = request.data || {};
  const eventoId = String(dados.eventoId || '').trim();
  if (!eventoId) {
    throw new HttpsError('invalid-argument', 'O identificador do evento (eventoId) é obrigatório.');
  }

  const [evSnap, ctrSnap, negSnap, finSnap] = await Promise.all([
    db.ref(`/eventos/${eventoId}`).get(),
    db.ref(`/contratos/${eventoId}`).get(),
    db.ref(`/negociacoes/${eventoId}`).get(),
    db.ref(`/eventos_fin/${eventoId}`).get()
  ]);

  const eventoExistente = evSnap.exists() ? evSnap.val() : null;
  const contratoExistente = ctrSnap.exists() ? ctrSnap.val() : null;
  const negExistente = negSnap.exists() ? negSnap.val() : {};
  const finExistente = finSnap.exists() ? finSnap.val() : {};

  let termosValidados;
  try {
    termosValidados = validarTermosComerciaisEvento(
      {
        ...dados,
        negociacao: dados.negociacao || negExistente,
        eventoFin: dados.eventoFin || finExistente
      },
      {
        eventoExistente,
        contratoExistente
      }
    );
  } catch (err) {
    const ehArg =
      err.message.includes('obrigatório') ||
      err.message.includes('inválid') ||
      err.message.includes('Faixa') ||
      err.message.includes('faixas');
    throw new HttpsError(ehArg ? 'invalid-argument' : 'failed-precondition', err.message);
  }

  const usuario = auth.token.email || auth.uid;
  const dataHora = formatarDataHoraBR(nowDate);
  const { versao, hashTermosSha256, contratoCompleto, resumoProdutor } = gerarVersaoContratoAditivo({
    termosValidados,
    contratoExistente,
    usuario,
    dataHora
  });

  const updates = {
    [`/contratos/${eventoId}`]: contratoCompleto,
    [`/contratos_produtor/${termosValidados.produtoraId}/${eventoId}`]: resumoProdutor,
    [`/negociacoes/${eventoId}`]: termosValidados.negociacao,
    [`/eventos_fin/${eventoId}`]: termosValidados.eventoFin
  };

  await db.ref().update(updates);
  await recalcularTodaProdutora(termosValidados.produtoraId, null, db);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'comercial/contratos',
      eventoId,
      acao: termosValidados.ehAditivo ? `Publicação de Aditivo v${versao}` : 'Emissão de Contrato v1',
      resumo: `Contrato ${termosValidados.numeroContrato} v${versao} publicado para ${eventoId} (selo ${hashTermosSha256.slice(0, 12)}...). Motivo: ${termosValidados.motivoAditivo}`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: termosValidados.ehAditivo ? 'AditivoContratualPublicado' : 'ContratoComercialPublicado',
    origemModulo: 'comercial/contratos',
    referenciaId: `${eventoId}_v${versao}`,
    produtoraId: termosValidados.produtoraId,
    eventoId,
    payload: {
      eventoId,
      numeroContrato: termosValidados.numeroContrato,
      versao,
      hashTermosSha256
    }
  });

  return {
    eventoId,
    produtoraId: termosValidados.produtoraId,
    numeroContrato: termosValidados.numeroContrato,
    versao,
    ehAditivo: termosValidados.ehAditivo,
    hashTermosSha256,
    resumoProdutor
  };
}

exports.publicarVersaoContratoNegociacao = onCall(request => executarPublicarVersaoContratoNegociacao(request));
exports.executarPublicarVersaoContratoNegociacao = executarPublicarVersaoContratoNegociacao;

exports.processar_comercial_contratos = onCall(async request => {
  if (request.data && request.data.eventoId && (request.data.negociacao || request.data.eventoFin)) {
    return executarPublicarVersaoContratoNegociacao(request);
  }
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Acesso restrito ao perfil Financeiro.');
  }

  const validacao = validarContratos(request.data || {});
  if (!validacao.valido) {
    throw new HttpsError('invalid-argument', validacao.erros.join(' '));
  }

  await registrarAuditoria({
    usuario: auth.token.email || auth.uid,
    modulo: 'comercial/contratos',
    eventoId: request.data.eventoId || '',
    acao: 'Processar Contratos',
    resumo: `Processamento no nó /contratos`
  });

  return { ok: true, id: 'comercial/contratos', no: 'contratos' };
});
