/**
 * Cloud Functions Callables — Módulo Fiscal e Retenções por Competência (financeiro/fiscal)
 * - apurarImpostosCompetencia: apura ISS, PIS, COFINS, IRPJ, CSLL e retenções de eventos em /apuracoes_fiscais/{competencia}
 * - recolherGuiaFiscal: liquida guia de recolhimento com lançamento em partida dobrada no Ledger (respeitando /fechamentos)
 */
'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  obterDataAtualBR,
  obterCompetenciaAtualBR,
  competenciaEstaFechada,
  criarLancamentoPartidaDobrada,
  PLANO_CONTAS,
  registrarAuditoria,
  temPermissao,
  publicarEventoDominio
} = require('../../../../services/functions/src/shared/recalculo');
const { calcularApuracaoFiscalCompetencia } = require('../domain');

const { onCall, HttpsError } = httpsV2;

async function executarApurarImpostosCompetencia(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (
    !auth ||
    (!temPermissao(auth.token, 'fiscal:gerenciar') && !temPermissao(auth.token, 'competencia:fechar'))
  ) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "fiscal:gerenciar" ou "competencia:fechar" (Financeiro, Fiscal ou Aprovador) podem apurar impostos.'
    );
  }

  const { competencia = obterCompetenciaAtualBR(nowDate), aliquotas, produtoraId = 'disk_matriz' } =
    request.data || {};

  const [evSnap, evFinSnap, negSnap, despSnap, locSnap, lancSnap, cfgSnap, fechSnap] = await Promise.all([
    customDb.ref('/eventos').get(),
    customDb.ref('/eventos_fin').get(),
    customDb.ref('/negociacoes').get(),
    customDb.ref('/despesas').get(),
    customDb.ref('/locais').get(),
    customDb.ref('/lancamentos').get(),
    customDb.ref('/config/fiscal').get(),
    customDb.ref('/fechamentos').get()
  ]);

  const fechamentosMap = (fechSnap && fechSnap.val()) || {};
  if (competenciaEstaFechada(competencia, fechamentosMap)) {
    throw new HttpsError(
      'failed-precondition',
      `A competência ${competencia} está encerrada em /fechamentos e não permite reprocessar apuração fiscal.`
    );
  }

  const aliquotasEfetivas = {
    ...((cfgSnap && cfgSnap.val()) || {}),
    ...(aliquotas || {})
  };

  let apuracao;
  try {
    apuracao = calcularApuracaoFiscalCompetencia({
      competencia,
      eventos: (evSnap && evSnap.val()) || {},
      eventosFin: (evFinSnap && evFinSnap.val()) || {},
      negociacoes: (negSnap && negSnap.val()) || {},
      despesas: (despSnap && despSnap.val()) || {},
      locais: (locSnap && locSnap.val()) || {},
      lancamentos: (lancSnap && lancSnap.val()) || {},
      aliquotas: aliquotasEfetivas
    });
  } catch (err) {
    throw new HttpsError('invalid-argument', err.message || 'Erro ao calcular apuração fiscal.');
  }

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);

  const registro = {
    id: competencia,
    produtoraId,
    ...apuracao,
    status: 'Apurada',
    apuradoPor: usuario,
    apuradoEm: agora
  };

  const updates = {
    [`/apuracoes_fiscais/${competencia}`]: registro
  };

  if (apuracao.totalGuiasARecolherCents > 0) {
    updates[`/contas_pagar/cp_fisc_${competencia}`] = {
      id: `cp_fisc_${competencia}`,
      natureza: 'pagar',
      produtoraId,
      competencia,
      categoria: 'Guias Fiscais e Retenções',
      fornecedor: 'Fazenda Municipal / Federal / ECAD',
      valor: apuracao.totalGuiasARecolher,
      valorCents: apuracao.totalGuiasARecolherCents,
      valorOriginal: apuracao.totalGuiasARecolher,
      valorPago: 0,
      valorBaixadoCents: 0,
      status: 'Aprovada',
      criadoEm: agora
    };
  }

  await customDb.ref().update(updates);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'financeiro/fiscal',
      eventoId: competencia,
      acao: 'Apuração Fiscal Mensal',
      resumo: `Competência ${competencia} apurada: Tributos próprios R$ ${apuracao.tributosProprios.total.toFixed(2)}, Retenções a recolher R$ ${apuracao.retencoesTerceiros.saldoARecolher.toFixed(2)}.`
    },
    customDb
  );

  await publicarEventoDominio(customDb, {
    tipo: 'financeiro.fiscal.processado',
    origemModulo: 'financeiro/fiscal',
    referenciaId: competencia,
    produtoraId,
    payload: {
      competencia,
      totalGuiasARecolherCents: apuracao.totalGuiasARecolherCents,
      seloApuracaoSha256: apuracao.seloApuracaoSha256
    }
  });

  return registro;
}

async function executarRecolherGuiaFiscal(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (
    !auth ||
    (!temPermissao(auth.token, 'fiscal:gerenciar') && !temPermissao(auth.token, 'titulo:baixar'))
  ) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "fiscal:gerenciar" ou "titulo:baixar" podem recolher guias fiscais.'
    );
  }

  const { competencia, protocoloGuia = '' } = request.data || {};
  if (!competencia || !protocoloGuia || String(protocoloGuia).trim().length < 3) {
    throw new HttpsError('invalid-argument', 'Informe competencia e protocoloGuia.');
  }

  const [apSnap, fechSnap] = await Promise.all([
    customDb.ref(`/apuracoes_fiscais/${competencia}`).get(),
    customDb.ref('/fechamentos').get()
  ]);

  if (!apSnap.exists()) {
    throw new HttpsError('not-found', `Apuração fiscal da competência ${competencia} não encontrada.`);
  }

  const apuracao = apSnap.val();
  if (apuracao.status === 'Recolhida') {
    throw new HttpsError('failed-precondition', `As guias da competência ${competencia} já foram recolhidas.`);
  }

  const fechamentosMap = (fechSnap && fechSnap.val()) || {};
  const dataBaixa = obterDataAtualBR(nowDate);
  const compBaixa = obterCompetenciaAtualBR(nowDate);

  if (competenciaEstaFechada(compBaixa, fechamentosMap)) {
    throw new HttpsError(
      'failed-precondition',
      `A competência ${compBaixa} está encerrada em /fechamentos e bloqueia lançamentos de recolhimento fiscal.`
    );
  }

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const protoLimpo = String(protocoloGuia).trim();
  const valorCents = Number(apuracao.totalGuiasARecolherCents || 0);

  if (valorCents <= 0) {
    throw new HttpsError('failed-precondition', 'Não há saldo positivo de guias a recolher nesta apuração.');
  }

  const lancamentoId = `lnc_fisc_${competencia}`;
  const lancamento = criarLancamentoPartidaDobrada(
    {
      id: lancamentoId,
      data: dataBaixa,
      competencia: compBaixa,
      produtoraId: apuracao.produtoraId || 'disk_matriz',
      origemModulo: 'Fiscal',
      origemId: competencia,
      contaDebito: PLANO_CONTAS.OBRIGACOES_RETENCOES_RECOLHER,
      contaCredito: PLANO_CONTAS.BANCO_CONTA_MOVIMENTO,
      valorCents,
      historico: `Recolhimento de guias fiscais e retenções competência ${competencia} (${protoLimpo})`,
      usuario,
      criadoPor: usuario,
      criadoEm: agora
    },
    fechamentosMap
  );

  const updates = {
    [`/apuracoes_fiscais/${competencia}/status`]: 'Recolhida',
    [`/apuracoes_fiscais/${competencia}/protocoloGuia`]: protoLimpo,
    [`/apuracoes_fiscais/${competencia}/recolhidoPor`]: usuario,
    [`/apuracoes_fiscais/${competencia}/recolhidoEm`]: agora,
    [`/contas_pagar/cp_fisc_${competencia}/status`]: 'Paga',
    [`/contas_pagar/cp_fisc_${competencia}/valorPago`]: apuracao.totalGuiasARecolher,
    [`/contas_pagar/cp_fisc_${competencia}/valorBaixadoCents`]: valorCents,
    [`/contas_pagar/cp_fisc_${competencia}/protocoloBancario`]: protoLimpo,
    [`/lancamentos/${lancamentoId}`]: lancamento
  };

  await customDb.ref().update(updates);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'financeiro/fiscal',
      eventoId: competencia,
      acao: 'Recolhimento de Guia Fiscal',
      resumo: `Guias da competência ${competencia} recolhidas (R$ ${Number(apuracao.totalGuiasARecolher).toFixed(2)}, protocolo ${protoLimpo}).`
    },
    customDb
  );

  return {
    competencia,
    status: 'Recolhida',
    protocoloGuia: protoLimpo,
    lancamento
  };
}

exports.apurarImpostosCompetencia = onCall(req => executarApurarImpostosCompetencia(req));
exports.recolherGuiaFiscal = onCall(req => executarRecolherGuiaFiscal(req));
exports.executarApurarImpostosCompetencia = executarApurarImpostosCompetencia;
exports.executarRecolherGuiaFiscal = executarRecolherGuiaFiscal;
