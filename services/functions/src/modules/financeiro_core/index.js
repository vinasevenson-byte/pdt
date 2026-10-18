/**
 * Callables dos Novos Módulos Financeiros (Seção 5):
 * - registrarBaixaTitulo (/contas_pagar ou /contas_receber -> /lancamentos + /fluxo_caixa + /auditoria)
 * - estornarLancamento (/lancamentos imutável -> novo lançamento inverso + /auditoria)
 * - fecharCompetencia (/fechamentos/{competencia} -> congela período + /auditoria)
 */

'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const {
  db,
  formatarDataHoraBR,
  registrarAuditoria,
  somarDiasUteis,
  calcFluxoCaixa,
  baixarTitulo,
  gerarEstornoLancamento
} = require('../../shared/recalculo');

async function atualizarSnapshotFluxoCaixa() {
  const [crSnap, cpSnap] = await Promise.all([
    db.ref('/contas_receber').get(),
    db.ref('/contas_pagar').get()
  ]);
  const snapshot = calcFluxoCaixa({
    contasReceber: crSnap.val() || {},
    contasPagar: cpSnap.val() || {},
    saldoInicial: 0,
    dataReferencia: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    somarDiasUteisFn: somarDiasUteis
  });
  await db.ref('/fluxo_caixa').set({
    ...snapshot,
    atualizadoEm: formatarDataHoraBR()
  });
  return snapshot;
}

exports.registrarBaixaTitulo = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Apenas o perfil Financeiro pode baixar títulos.');
  }

  const { natureza, tituloId, dataBaixa, contaBanco, historico } = request.data || {};
  const colecao = natureza === 'pagar' ? 'contas_pagar' : natureza === 'receber' ? 'contas_receber' : null;
  if (!colecao || !tituloId) {
    throw new HttpsError('invalid-argument', 'Informe natureza ("pagar" ou "receber") e tituloId.');
  }

  const [titSnap, fechSnap] = await Promise.all([
    db.ref(`/${colecao}/${tituloId}`).get(),
    db.ref('/fechamentos').get()
  ]);

  if (!titSnap.exists()) {
    throw new HttpsError('not-found', `Título ${tituloId} não encontrado em /${colecao}.`);
  }

  const usuario = auth.token.email || auth.uid;
  const novoLancRef = db.ref('/lancamentos').push();

  try {
    const { tituloAtualizado, lancamento } = baixarTitulo(
      { id: tituloId, natureza, ...titSnap.val() },
      {
        lancamentoId: novoLancRef.key,
        dataBaixa: dataBaixa || new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        contaBanco,
        historico,
        usuario
      },
      fechSnap.val() || {}
    );

    const updates = {
      [`/${colecao}/${tituloId}`]: tituloAtualizado,
      [`/lancamentos/${novoLancRef.key}`]: lancamento
    };
    await db.ref().update(updates);
    await atualizarSnapshotFluxoCaixa();

    await registrarAuditoria({
      usuario,
      modulo: colecao,
      eventoId: tituloAtualizado.eventoId || '',
      acao: `Baixa de Título (${tituloAtualizado.status})`,
      resumo: `Título ${tituloId} baixado por R$ ${Number(tituloAtualizado.valorBaixado).toFixed(2)}. Lançamento ledger: ${novoLancRef.key}.`
    });

    return { titulo: tituloAtualizado, lancamento };
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message);
  }
});

exports.estornarLancamento = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Apenas o perfil Financeiro pode estornar lançamentos no Ledger.');
  }

  const { lancamentoId, motivo, dataEstorno } = request.data || {};
  if (!lancamentoId || !motivo) {
    throw new HttpsError('invalid-argument', 'Informe lancamentoId e motivo do estorno.');
  }

  const [lancSnap, fechSnap] = await Promise.all([
    db.ref(`/lancamentos/${lancamentoId}`).get(),
    db.ref('/fechamentos').get()
  ]);

  if (!lancSnap.exists()) {
    throw new HttpsError('not-found', 'Lançamento original não encontrado.');
  }

  const usuario = auth.token.email || auth.uid;
  const estornoRef = db.ref('/lancamentos').push();

  try {
    const estorno = gerarEstornoLancamento(
      { id: lancamentoId, ...lancSnap.val() },
      {
        id: estornoRef.key,
        motivo,
        data: dataEstorno || new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        usuario
      },
      fechSnap.val() || {}
    );

    await estornoRef.set(estorno);
    await registrarAuditoria({
      usuario,
      modulo: 'Ledger',
      eventoId: estorno.eventoId || '',
      acao: 'Estorno Contábil',
      resumo: `Estorno ${estornoRef.key} gerado para lançamento original ${lancamentoId}: ${motivo}`
    });

    return estorno;
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message);
  }
});

exports.fecharCompetencia = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Apenas o perfil Financeiro pode fechar competências.');
  }

  const { competencia, observacoes = '' } = request.data || {};
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    throw new HttpsError('invalid-argument', 'Informe a competência no formato YYYY-MM.');
  }

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR();
  const payload = {
    competencia,
    fechado: true,
    status: 'Fechado',
    fechadoPor: usuario,
    fechadoEm: agora,
    observacoes: String(observacoes)
  };

  await db.ref(`/fechamentos/${competencia}`).set(payload);
  await registrarAuditoria({
    usuario,
    modulo: 'Fechamentos',
    eventoId: '',
    acao: 'Fechamento de Competência',
    resumo: `Competência ${competencia} encerrada por ${usuario}. Escrita retroativa no Ledger bloqueada.`
  });

  return payload;
});
