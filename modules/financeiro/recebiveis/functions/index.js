/**
 * Cloud Function Handler — Módulo Recebíveis de Gateway e Adquirente (financeiro/recebiveis)
 * - `liquidarAgendaAdquirente`: baixa título em `/contas_receber`, calcula MDR, grava agenda em `/recebiveis_agenda`
 *   e posta os lançamentos imutáveis em partida dobrada no Ledger (`/lancamentos`).
 */
'use strict';

const {
  db: defaultDb,
  httpsV2,
  obterDataAtualBR,
  obterCompetenciaAtualBR,
  competenciaEstaFechada,
  formatarDataHoraBR,
  registrarAuditoria,
  temPermissao,
  publicarEventoDominio
} = require('../../../../services/functions/src/shared/recalculo');
const {
  calcularLiquidacaoAdquirente,
  gerarLancamentosLiquidacaoAdquirente
} = require('../domain');
const { onCall, HttpsError } = httpsV2;

async function executarLiquidarAgendaAdquirente(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'recebiveis:gerenciar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "recebiveis:gerenciar" podem liquidar recebíveis de adquirentes.'
    );
  }

  const dados = request.data || {};
  const tituloReceberId = String(dados.tituloReceberId || '').trim();
  const protocoloAdquirente = String(dados.protocoloAdquirente || '').trim();
  if (!tituloReceberId) {
    throw new HttpsError('invalid-argument', 'O campo tituloReceberId é obrigatório.');
  }
  if (protocoloAdquirente.length < 3) {
    throw new HttpsError('invalid-argument', 'Informe o protocoloAdquirente da liquidação (mínimo 3 caracteres).');
  }

  const competencia = obterCompetenciaAtualBR(nowDate);
  const [crSnap, fechSnap] = await Promise.all([
    db.ref(`/contas_receber/${tituloReceberId}`).get(),
    db.ref('/fechamentos').get()
  ]);

  if (!crSnap.exists()) {
    throw new HttpsError('failed-precondition', `Título a receber "${tituloReceberId}" não encontrado.`);
  }
  const titulo = crSnap.val();
  if (titulo.status === 'LiquidadoAdquirente') {
    throw new HttpsError('failed-precondition', `O título "${tituloReceberId}" já teve a agenda de adquirente liquidada.`);
  }

  if (competenciaEstaFechada(fechSnap.val() || {}, competencia)) {
    throw new HttpsError(
      'failed-precondition',
      `A competência contábil ${competencia} está fechada. Não é permitido contabilizar liquidação de adquirente.`
    );
  }

  let calculo;
  try {
    calculo = calcularLiquidacaoAdquirente(dados, titulo);
  } catch (err) {
    throw new HttpsError('invalid-argument', err.message);
  }

  const usuario = auth.token.email || auth.uid;
  const dataHora = formatarDataHoraBR(nowDate);
  const dataLiquidacao = obterDataAtualBR(nowDate);
  const agendaId = `ag_rcb_${tituloReceberId}`;

  const lancamentos = gerarLancamentosLiquidacaoAdquirente({
    agendaId,
    tituloReceberId,
    produtoraId: titulo.produtoraId,
    eventoId: titulo.eventoId,
    calculo,
    competencia,
    dataLiquidacao,
    usuario,
    protocoloAdquirente
  });

  const registroAgenda = {
    id: agendaId,
    tituloReceberId,
    produtoraId: titulo.produtoraId,
    eventoId: titulo.eventoId,
    adquirente: String(dados.adquirente || 'Stone / Pagar.me'),
    protocoloAdquirente,
    status: 'Liquidado',
    ...calculo,
    liquidadoPor: usuario,
    liquidadoEm: dataHora
  };

  const updates = {
    [`/recebiveis_agenda/${agendaId}`]: registroAgenda,
    [`/contas_receber/${tituloReceberId}/status`]: 'LiquidadoAdquirente',
    [`/contas_receber/${tituloReceberId}/valorLiquidoAdquirente`]: calculo.valorLiquido,
    [`/contas_receber/${tituloReceberId}/descontoMdr`]: calculo.totalDescontosGateway,
    [`/contas_receber/${tituloReceberId}/protocoloAdquirente`]: protocoloAdquirente,
    [`/contas_receber/${tituloReceberId}/liquidadoEm`]: dataHora
  };

  for (const [lncId, lncObj] of Object.entries(lancamentos)) {
    updates[`/lancamentos/${lncId}`] = lncObj;
  }

  await db.ref().update(updates);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'financeiro/recebiveis',
      eventoId: titulo.eventoId || '',
      acao: 'Liquidação de Recebível de Adquirente',
      resumo: `Título ${tituloReceberId} liquidado (${protocoloAdquirente}): Bruto R$ ${calculo.valorBruto.toFixed(2)}, MDR R$ ${calculo.totalDescontosGateway.toFixed(2)}, Líquido R$ ${calculo.valorLiquido.toFixed(2)}.`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: 'RecebivelAdquirenteLiquidado',
    origemModulo: 'financeiro/recebiveis',
    referenciaId: agendaId,
    produtoraId: titulo.produtoraId,
    eventoId: titulo.eventoId,
    payload: {
      agendaId,
      tituloReceberId,
      valorBrutoCents: calculo.valorBrutoCents,
      valorLiquidoCents: calculo.valorLiquidoCents,
      totalDescontosGatewayCents: calculo.totalDescontosGatewayCents
    }
  });

  return {
    agendaId,
    tituloReceberId,
    status: 'Liquidado',
    ...calculo,
    lancamentosIds: Object.keys(lancamentos)
  };
}

exports.liquidarAgendaAdquirente = onCall(request => executarLiquidarAgendaAdquirente(request));
exports.executarLiquidarAgendaAdquirente = executarLiquidarAgendaAdquirente;
exports.processar_financeiro_recebiveis = onCall(request => executarLiquidarAgendaAdquirente(request));
