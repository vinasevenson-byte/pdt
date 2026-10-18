/**
 * Callables HTTPS (`solicitarRepasse`, `decidirRepasse`, `solicitarAntecipacao`)
 */

'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const {
  db,
  logger,
  formatarDataHoraBR,
  registrarAuditoria,
  recalcularTodaProdutora,
  calcTransferencia,
  calcularRateioRepasse
} = require('../shared/recalculo');

exports.solicitarRepasse = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== 'produtor' || !auth.token.produtoraId) {
    throw new HttpsError('permission-denied', 'Apenas produtores autenticados podem solicitar repasse.');
  }

  const produtoraId = auth.token.produtoraId;
  const { eventoIds, valor, forma, contaId } = request.data || {};

  if (!Array.isArray(eventoIds) || eventoIds.length === 0) {
    throw new HttpsError('invalid-argument', 'Selecione ao menos um evento liberado para solicitar o repasse.');
  }
  if (!['PIX', 'TED'].includes(forma)) {
    throw new HttpsError('invalid-argument', 'A forma de pagamento deve ser exclusivamente PIX ou TED.');
  }
  const valorSolicitado = Number(valor || 0);
  if (!Number.isFinite(valorSolicitado) || valorSolicitado <= 0) {
    throw new HttpsError('invalid-argument', 'Informe um valor de repasse maior que zero.');
  }

  const contaSnap = await db.ref(`/contas/${produtoraId}/${contaId}`).get();
  if (!contaSnap.exists() || contaSnap.val().status !== 'Validada') {
    throw new HttpsError('failed-precondition', 'A conta bancária selecionada não existe ou ainda não foi validada pelo Financeiro.');
  }

  const { eventosCalculados, cons, cfgTransferencia } = await recalcularTodaProdutora(produtoraId);

  for (const evId of eventoIds) {
    const evCalc = eventosCalculados.find(e => e.id === evId);
    if (!evCalc) {
      throw new HttpsError('permission-denied', `O evento ${evId} não pertence à sua produtora.`);
    }
    if (!evCalc.liberadoParaSolicitacao || evCalc.liberavel <= 0) {
      throw new HttpsError('failed-precondition', `O evento "${evCalc.nome}" não possui saldo liberado para solicitação.`);
    }
  }

  const disponivelServidor = cons.disponivel(eventoIds);
  if (valorSolicitado > disponivelServidor + 0.009) {
    throw new HttpsError(
      'failed-precondition',
      `O valor solicitado (R$ ${valorSolicitado.toFixed(2)}) excede o saldo disponível recalculado no servidor (R$ ${disponivelServidor.toFixed(2)}).`
    );
  }

  const transf = calcTransferencia(valorSolicitado, forma, cfgTransferencia);

  const novoRepRef = db.ref('/repasses').push();
  const payload = {
    produtoraId,
    eventoIds,
    valorSolicitado: transf.valorBruto,
    tarifaTransferencia: transf.tarifa,
    valorLiquido: transf.valorLiquido,
    forma: transf.forma,
    contaId,
    status: 'Solicitado',
    solicitadoEm: formatarDataHoraBR()
  };

  await novoRepRef.set(payload);
  logger.info(`[solicitarRepasse] Repasse ${novoRepRef.key} criado para ${produtoraId}`, payload);

  return { id: novoRepRef.key, ...payload };
});

exports.decidirRepasse = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Apenas usuários do perfil Financeiro podem aprovar ou recusar repasses.');
  }

  const { repasseId, acao, motivo, modoRateio, rateioManual, protocoloBancario, comprovanteUrl } = request.data || {};
  if (!repasseId || !['aprovar', 'recusar', 'pagar'].includes(acao)) {
    throw new HttpsError('invalid-argument', 'Parâmetros inválidos. Informe repasseId e acao ("aprovar", "recusar" ou "pagar").');
  }

  const repSnap = await db.ref(`/repasses/${repasseId}`).get();
  if (!repSnap.exists()) {
    throw new HttpsError('not-found', 'Solicitação de repasse não encontrada.');
  }

  const repasse = repSnap.val();
  const usuarioEmail = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR();

  if (acao === 'recusar') {
    if (!motivo || String(motivo).trim().length < 3) {
      throw new HttpsError('invalid-argument', 'Informe obrigatoriamente o motivo da recusa.');
    }
    const updRecusa = {
      status: 'Recusado',
      motivoRecusa: String(motivo).trim(),
      decididoPor: usuarioEmail,
      decididoEm: agora
    };
    await db.ref(`/repasses/${repasseId}`).update(updRecusa);
    await registrarAuditoria({
      usuario: usuarioEmail,
      modulo: 'Repasses',
      eventoId: (repasse.eventoIds || []).join(', '),
      acao: 'Recusa de Repasse',
      resumo: `Repasse ${repasseId} recusado (${String(motivo).trim()})`
    });
    return { status: 'Recusado' };
  }

  if (repasse.status === 'Aprovado' && acao === 'pagar') {
    const updPago = {
      status: 'Pago',
      pagoPor: usuarioEmail,
      pagoEm: agora,
      protocoloBancario: String(protocoloBancario || repasse.protocoloBancario || '').trim(),
      comprovanteUrl: String(comprovanteUrl || repasse.comprovanteUrl || '').trim()
    };
    await db.ref(`/repasses/${repasseId}`).update(updPago);
    await registrarAuditoria({
      usuario: usuarioEmail,
      modulo: 'Repasses',
      eventoId: (repasse.eventoIds || []).join(', '),
      acao: 'Liquidação Bancária (Pago)',
      resumo: `Repasse ${repasseId} marcado como Pago. Protocolo: ${updPago.protocoloBancario || 'N/A'}`
    });
    return { status: 'Pago', protocoloBancario: updPago.protocoloBancario };
  }

  const { eventosCalculados, cons, advancedList, antecipacoesList } = await recalcularTodaProdutora(repasse.produtoraId);
  const selecionados = eventosCalculados.filter(e => (repasse.eventoIds || []).includes(e.id));
  const disponivelAtual = cons.disponivel(repasse.eventoIds || []);

  if (repasse.valorSolicitado > disponivelAtual + 0.009) {
    const msgAutomatica = `Recusado automaticamente na validação: valor solicitado (R$ ${repasse.valorSolicitado.toFixed(2)}) maior que o disponível atual (R$ ${disponivelAtual.toFixed(2)}).`;
    await db.ref(`/repasses/${repasseId}`).update({
      status: 'Recusado',
      motivoRecusa: msgAutomatica,
      decididoPor: usuarioEmail,
      decididoEm: agora
    });
    throw new HttpsError('failed-precondition', msgAutomatica);
  }

  const rateioRes = calcularRateioRepasse(
    selecionados,
    repasse.valorSolicitado,
    modoRateio === 'manual' ? 'manual' : 'proporcional',
    rateioManual || {}
  );
  if (!rateioRes.valido) {
    throw new HttpsError('invalid-argument', rateioRes.erro || 'Rateio inválido.');
  }

  const updates = {};
  const rateioEventos = rateioRes.quotasPorEvento || {};

  for (const evCalc of selecionados) {
    const quota = Number(rateioEventos[evCalc.id] || 0);
    updates[`/eventos/${evCalc.id}/jaRepassado`] = Math.round((evCalc.jaRepassado + quota) * 100) / 100;
  }

  for (const adv of advancedList) {
    if (adv.abaterNoProximo && (adv.escopo === 'consolidado' || (repasse.eventoIds || []).includes(adv.escopo))) {
      updates[`/advanced/${adv.id}/abaterNoProximo`] = false;
    }
  }
  for (const ant of antecipacoesList) {
    if (ant.abaterNoProximo && (repasse.eventoIds || []).includes(ant.eventoId) && (ant.status === 'Aprovada' || ant.status === 'Paga')) {
      updates[`/antecipacoes/${ant.id}/abaterNoProximo`] = false;
    }
  }

  const memoriaCalculo = {
    aprovadoPor: usuarioEmail,
    aprovadoEm: agora,
    disponivelNoMomento: disponivelAtual,
    modoRateio: rateioRes.modoRateio,
    rateioAplicado: rateioEventos,
    consolidadoSnapshot: {
      liberavelEventos: cons.liberavelEventos,
      patrocinioProdutora: cons.patrocinioProdutora,
      advConsolidado: cons.advConsolidado,
      devedores: cons.devedores
    },
    eventosSnapshot: selecionados
  };

  const statusFinal = acao === 'pagar' ? 'Pago' : 'Aprovado';
  updates[`/repasses/${repasseId}/status`] = statusFinal;
  updates[`/repasses/${repasseId}/decididoPor`] = usuarioEmail;
  updates[`/repasses/${repasseId}/decididoEm`] = agora;
  updates[`/repasses/${repasseId}/modoRateio`] = rateioRes.modoRateio;
  updates[`/repasses/${repasseId}/protocoloBancario`] = String(protocoloBancario || '').trim();
  updates[`/repasses/${repasseId}/comprovanteUrl`] = String(comprovanteUrl || '').trim();
  if (statusFinal === 'Pago') {
    updates[`/repasses/${repasseId}/pagoPor`] = usuarioEmail;
    updates[`/repasses/${repasseId}/pagoEm`] = agora;
  }
  updates[`/repasses/${repasseId}/memoriaCalculo`] = memoriaCalculo;

  await db.ref().update(updates);
  await registrarAuditoria({
    usuario: usuarioEmail,
    modulo: 'Repasses',
    eventoId: (repasse.eventoIds || []).join(', '),
    acao: statusFinal === 'Pago' ? 'Aprovação e Pagamento de Repasse' : 'Aprovação de Repasse',
    resumo: `Repasse ${repasseId} (${statusFinal}) — R$ ${Number(repasse.valorSolicitado).toFixed(2)} via ${repasse.forma} (rateio ${rateioRes.modoRateio}).`
  });
  await recalcularTodaProdutora(repasse.produtoraId);

  return { status: statusFinal, memoriaCalculo };
});

exports.solicitarAntecipacao = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== 'produtor' || !auth.token.produtoraId) {
    throw new HttpsError('permission-denied', 'Apenas produtores autenticados podem solicitar antecipação.');
  }

  const produtoraId = auth.token.produtoraId;
  const { eventoId, valor } = request.data || {};
  const valorSolicitado = Number(valor || 0);

  if (!eventoId || !Number.isFinite(valorSolicitado) || valorSolicitado <= 0) {
    throw new HttpsError('invalid-argument', 'Informe um evento válido e um valor de antecipação maior que zero.');
  }

  const [cfgSnap, recalc] = await Promise.all([
    db.ref('/config/antecipacao').get(),
    recalcularTodaProdutora(produtoraId)
  ]);

  const cfg = cfgSnap.val() || { pctLimite: 50, taxaPct: 2 };
  const pctLimite = Number(cfg.pctLimite || 50);
  const taxaPct = Number(cfg.taxaPct || 2);

  const evCalc = recalc.eventosCalculados.find(e => e.id === eventoId);
  if (!evCalc) {
    throw new HttpsError('permission-denied', 'O evento informado não pertence à sua produtora.');
  }

  const jaAntecipadoEvento = recalc.antecipacoesList
    .filter(a => a.eventoId === eventoId && a.status !== 'Recusada')
    .reduce((acc, a) => acc + Number(a.valor || 0), 0);

  const limiteDisponivel = Math.max(0, (evCalc.retido * (pctLimite / 100)) - jaAntecipadoEvento);
  if (valorSolicitado > limiteDisponivel + 0.009) {
    throw new HttpsError(
      'failed-precondition',
      `O valor solicitado (R$ ${valorSolicitado.toFixed(2)}) ultrapassa o limite disponível para antecipação neste evento (R$ ${limiteDisponivel.toFixed(2)}).`
    );
  }

  const novaAntRef = db.ref('/antecipacoes').push();
  const payload = {
    produtoraId,
    eventoId,
    data: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    valor: Math.round(valorSolicitado * 100) / 100,
    taxaPct,
    abaterNoProximo: true,
    status: 'Solicitada'
  };

  await novaAntRef.set(payload);
  logger.info(`[solicitarAntecipacao] Antecipação ${novaAntRef.key} solicitada por ${produtoraId}`, payload);
  return { id: novaAntRef.key, ...payload };
});
