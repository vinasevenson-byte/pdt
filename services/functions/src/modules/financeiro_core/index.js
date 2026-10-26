/**
 * Callables dos Novos Módulos Financeiros (Seção 5):
 * - registrarBaixaTitulo (/contas_pagar ou /contas_receber -> /lancamentos + /fluxo_caixa + /auditoria)
 * - estornarLancamento (/lancamentos imutável -> novo lançamento inverso + /auditoria)
 * - fecharCompetencia (/fechamentos/{competencia} -> congela período + /auditoria)
 */

'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  obterDataAtualBR,
  registrarAuditoria,
  somarDiasUteis,
  calcFluxoCaixa,
  baixarTitulo,
  gerarEstornoLancamento,
  temPermissao
} = require('../../shared/recalculo');

const { onCall, HttpsError } = httpsV2;

async function atualizarSnapshotFluxoCaixa(customDb = defaultDb) {
  const [crSnap, cpSnap] = await Promise.all([
    customDb.ref('/contas_receber').get(),
    customDb.ref('/contas_pagar').get()
  ]);
  const snapshot = calcFluxoCaixa({
    contasReceber: crSnap.val() || {},
    contasPagar: cpSnap.val() || {},
    saldoInicial: 0,
    dataReferencia: obterDataAtualBR(),
    somarDiasUteisFn: somarDiasUteis
  });
  await customDb.ref('/fluxo_caixa').set({
    ...snapshot,
    atualizadoEm: formatarDataHoraBR()
  });
  return snapshot;
}

async function executarRegistrarBaixaTitulo(request, deps = {}) {
  const db = deps.db || defaultDb;
  const auth = request.auth;
  if (!auth || !temPermissao(auth.token, 'titulo:baixar')) {
    throw new HttpsError('permission-denied', 'Apenas perfis com permissão "titulo:baixar" (Financeiro, Aprovador ou Operador) podem baixar títulos.');
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
        dataBaixa: dataBaixa || obterDataAtualBR(),
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
    await atualizarSnapshotFluxoCaixa(db);

    await registrarAuditoria({
      usuario,
      modulo: colecao,
      eventoId: tituloAtualizado.eventoId || '',
      acao: `Baixa de Título (${tituloAtualizado.status})`,
      resumo: `Título ${tituloId} baixado por R$ ${Number(tituloAtualizado.valorBaixado).toFixed(2)}. Lançamento ledger: ${novoLancRef.key}.`
    }, db);

    return { titulo: tituloAtualizado, lancamento };
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message);
  }
}

async function executarEstornarLancamento(request, deps = {}) {
  const db = deps.db || defaultDb;
  const auth = request.auth;
  if (!auth || !temPermissao(auth.token, 'ledger:estornar')) {
    throw new HttpsError('permission-denied', 'Apenas perfis com permissão "ledger:estornar" (Financeiro ou Aprovador) podem estornar lançamentos no Ledger.');
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
        data: dataEstorno || obterDataAtualBR(),
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
    }, db);

    return estorno;
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message);
  }
}

async function executarFecharCompetencia(request, deps = {}) {
  const db = deps.db || defaultDb;
  const auth = request.auth;
  if (!auth || !temPermissao(auth.token, 'competencia:fechar')) {
    throw new HttpsError('permission-denied', 'Apenas perfis com permissão "competencia:fechar" (Financeiro, Aprovador ou Fiscal) podem fechar competências.');
  }

  const { competencia, observacoes = '' } = request.data || {};
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    throw new HttpsError('invalid-argument', 'Informe a competência no formato YYYY-MM.');
  }

  const fechSnap = await db.ref(`/fechamentos/${competencia}`).get();
  if (fechSnap.exists() && fechSnap.val().fechado === true) {
    throw new HttpsError('failed-precondition', `A competência ${competencia} já se encontra encerrada.`);
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
  }, db);

  return payload;
}

exports.registrarBaixaTitulo = onCall((request) => executarRegistrarBaixaTitulo(request));
exports.estornarLancamento = onCall((request) => executarEstornarLancamento(request));
exports.fecharCompetencia = onCall((request) => executarFecharCompetencia(request));
exports.executarRegistrarBaixaTitulo = executarRegistrarBaixaTitulo;
exports.executarEstornarLancamento = executarEstornarLancamento;
exports.executarFecharCompetencia = executarFecharCompetencia;
