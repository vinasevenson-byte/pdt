/**
 * Cloud Function Handler — Módulo Cobrança, Inadimplência e Devedores (financeiro/cobranca)
 */
'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  registrarAuditoria,
  temPermissao,
  publicarEventoDominio
} = require('../../../../services/functions/src/shared/recalculo');
const { calcEvento } = require('../../../../packages/motor-repasse/src/index.js');
const { apurarPosicaoDevedoraProdutora } = require('../domain');
const { onCall, HttpsError } = httpsV2;

async function executarApurarCobrancaProdutora(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'cobranca:gerenciar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "cobranca:gerenciar" podem apurar cobrança e recomposição de saldo.'
    );
  }

  const dados = request.data || {};
  const produtoraId = String(dados.produtoraId || '').trim();
  if (!produtoraId) {
    throw new HttpsError('invalid-argument', 'O campo produtoraId é obrigatório.');
  }

  const [evSnap, finSnap, negSnap, locSnap, despSnap, advSnap, antSnap] = await Promise.all([
    db.ref('/eventos').orderByChild('produtoraId').equalTo(produtoraId).get(),
    db.ref('/eventos_fin').get(),
    db.ref('/negociacoes').get(),
    db.ref('/locais').get(),
    db.ref('/despesas').get(),
    db.ref('/advanced').get(),
    db.ref('/antecipacoes').get()
  ]);

  const eventosMap = evSnap.val() || {};
  const finMap = finSnap.val() || {};
  const negMap = negSnap.val() || {};
  const locMap = locSnap.val() || {};
  const despesasList = Object.values(despSnap.val() || {});
  const advList = Object.values(advSnap.val() || {});
  const antList = Object.values(antSnap.val() || {});

  const eventosCalculados = Object.entries(eventosMap).map(([evId, evData]) => {
    const calc = calcEvento(
      { id: evId, ...evData },
      finMap[evId] || {},
      negMap[evId] || {},
      despesasList.filter(d => d && d.eventoId === evId),
      advList.filter(a => a && a.escopo === evId),
      antList.filter(a => a && a.eventoId === evId),
      locMap[evData.localId] || {}
    );
    return {
      id: evId,
      nome: evData.nome || evId,
      ...calc
    };
  });

  const apuracao = apurarPosicaoDevedoraProdutora({ produtoraId, eventosCalculados });
  const usuario = auth.token.email || auth.uid;
  const dataHora = formatarDataHoraBR(nowDate);

  const registroCobranca = {
    ...apuracao,
    apuradoPor: usuario,
    apuradoEm: dataHora
  };

  const updates = {
    [`/cobrancas_devedores/${produtoraId}`]: registroCobranca
  };

  if (apuracao.dividaResidualCents > 0) {
    updates[`/contas_receber/cr_cob_${produtoraId}`] = {
      id: `cr_cob_${produtoraId}`,
      produtoraId,
      eventoId: apuracao.eventosDevedores[0] ? apuracao.eventosDevedores[0].eventoId : 'consolidado',
      categoria: 'recomposicao_saldo_devedor',
      descricao: `Recomposição de saldo devedor residual (${apuracao.eventosDevedores.length} evento(s) deficitário(s))`,
      valorCents: apuracao.dividaResidualCents,
      valor: apuracao.dividaResidual,
      status: 'Previsto',
      criadoPor: usuario,
      criadoEm: dataHora
    };
  }

  await db.ref().update(updates);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'financeiro/cobranca',
      eventoId: produtoraId,
      acao: `Apuração de Devedores (${apuracao.status})`,
      resumo: `Produtora ${produtoraId}: Devedor bruto R$ ${apuracao.totalDevedorBruto.toFixed(2)}, Compensado R$ ${apuracao.compensadoEntreEventos.toFixed(2)}, Dívida residual R$ ${apuracao.dividaResidual.toFixed(2)}.`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: 'PosicaoDevedoraApurada',
    origemModulo: 'financeiro/cobranca',
    referenciaId: registroCobranca.id,
    produtoraId,
    payload: {
      produtoraId,
      status: apuracao.status,
      totalDevedorBrutoCents: apuracao.totalDevedorBrutoCents,
      compensadoEntreEventosCents: apuracao.compensadoEntreEventosCents,
      dividaResidualCents: apuracao.dividaResidualCents
    }
  });

  return registroCobranca;
}

exports.apurarCobrancaProdutora = onCall(request => executarApurarCobrancaProdutora(request));
exports.executarApurarCobrancaProdutora = executarApurarCobrancaProdutora;
exports.processar_financeiro_cobranca = onCall(request => executarApurarCobrancaProdutora(request));
