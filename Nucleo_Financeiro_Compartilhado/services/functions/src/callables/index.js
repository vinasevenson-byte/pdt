/**
 * Callables HTTPS (`solicitarRepasse`, `decidirRepasse`, `solicitarAntecipacao`)
 * Fluxo completo com assinatura eletrônica de aceite, aprovação, integração com Contas a Pagar/Ledger e auditoria.
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
  const {
    eventoIds,
    valor,
    forma,
    contaId,
    aceiteBancario = true,
    aceiteTermosBordero = true
  } = request.data || {};

  if (!Array.isArray(eventoIds) || eventoIds.length === 0) {
    throw new HttpsError('invalid-argument', 'Selecione ao menos um evento liberado para solicitar o repasse.');
  }
  if (!['PIX', 'TED'].includes(forma)) {
    throw new HttpsError('invalid-argument', 'A forma de pagamento deve ser exclusivamente PIX ou TED.');
  }
  if (!aceiteBancario || !aceiteTermosBordero) {
    throw new HttpsError(
      'failed-precondition',
      'É obrigatório confirmar a exatidão dos dados bancários e concordar com os termos de repasse e borderô.'
    );
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
  const agora = formatarDataHoraBR();
  const solicitanteEmail = auth.token.email || auth.uid;

  const novoRepRef = db.ref('/repasses').push();
  const repasseId = novoRepRef.key;
  const assinaturaSolicitante = {
    uid: auth.uid,
    email: solicitanteEmail,
    produtoraId,
    aceiteBancario: Boolean(aceiteBancario),
    aceiteTermosBordero: Boolean(aceiteTermosBordero),
    assinadoEm: agora
  };

  const payload = {
    produtoraId,
    eventoIds,
    valorSolicitado: transf.valorBruto,
    tarifaTransferencia: transf.tarifa,
    valorLiquido: transf.valorLiquido,
    forma: transf.forma,
    contaId,
    status: 'Solicitado',
    solicitadoEm: agora,
    assinaturaSolicitante
  };

  await novoRepRef.set(payload);

  // Registra obrigação prevista em Contas a Pagar e trilha de Auditoria
  await db.ref(`/contas_pagar/cp_rep_${repasseId}`).set({
    id: `cp_rep_${repasseId}`,
    produtoraId,
    eventoId: eventoIds[0],
    repasseId,
    categoria: 'Repasse Produtor',
    fornecedor: produtoraId,
    valorOriginal: transf.valorLiquido,
    valorPago: 0,
    status: 'Prevista',
    criadoEm: agora
  });

  await registrarAuditoria({
    usuario: solicitanteEmail,
    modulo: 'Repasses',
    eventoId: eventoIds.join(', '),
    acao: 'Solicitação de Repasse Assinada',
    resumo: `Repasse ${repasseId} solicitado por ${solicitanteEmail} (${produtoraId}) — R$ ${transf.valorBruto.toFixed(2)} via ${transf.forma}.`
  });

  logger.info(`[solicitarRepasse] Repasse ${repasseId} criado para ${produtoraId}`, payload);

  return { id: repasseId, ...payload };
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
      decididoEm: agora,
      assinaturaFinanceiro: {
        uid: auth.uid,
        email: usuarioEmail,
        acao: 'recusar',
        assinadoEm: agora
      }
    };
    await db.ref(`/repasses/${repasseId}`).update(updRecusa);
    await db.ref(`/contas_pagar/cp_rep_${repasseId}/status`).set('Cancelada');
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
    const proto = String(protocoloBancario || repasse.protocoloBancario || '').trim();
    const compr = String(comprovanteUrl || repasse.comprovanteUrl || '').trim();
    const updPago = {
      status: 'Pago',
      pagoPor: usuarioEmail,
      pagoEm: agora,
      protocoloBancario: proto,
      comprovanteUrl: compr,
      assinaturaLiquidacao: {
        uid: auth.uid,
        email: usuarioEmail,
        protocoloBancario: proto,
        assinadoEm: agora
      }
    };
    await db.ref(`/repasses/${repasseId}`).update(updPago);
    await db.ref(`/contas_pagar/cp_rep_${repasseId}`).update({
      status: 'Paga',
      valorPago: Number(repasse.valorLiquido || repasse.valorSolicitado || 0),
      pagoEm: agora,
      protocoloBancario: proto
    });
    await db.ref(`/lancamentos/lnc_rep_${repasseId}`).set({
      id: `lnc_rep_${repasseId}`,
      competencia: new Date().toISOString().slice(0, 7),
      dataLancamento: new Date().toISOString().slice(0, 10),
      produtoraId: repasse.produtoraId,
      eventoId: (repasse.eventoIds || [])[0] || null,
      origemModulo: 'Repasses',
      origemId: repasseId,
      contaDebito: '2.1.01.01 - Obrigações de Repasse Produtor',
      contaCredito: '1.1.01.02 - Conta Movimento Bancária Disk',
      valor: Number(repasse.valorSolicitado || 0),
      historico: `Liquidação bancária repasse ${repasseId} (${proto || 'PIX/TED'})`,
      usuario: usuarioEmail,
      criadoEm: agora
    });
    await registrarAuditoria({
      usuario: usuarioEmail,
      modulo: 'Repasses',
      eventoId: (repasse.eventoIds || []).join(', '),
      acao: 'Liquidação Bancária (Pago)',
      resumo: `Repasse ${repasseId} marcado como Pago. Protocolo: ${proto || 'N/A'}`
    });
    return { status: 'Pago', protocoloBancario: proto };
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
  const rateioEventos = rateioRes.quotasPorEvento || rateioRes.rateio || {};
  const modoRateioFinal = rateioRes.modoRateio || rateioRes.modo || 'proporcional';

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
    modoRateio: modoRateioFinal,
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
  const proto = String(protocoloBancario || '').trim();
  const compr = String(comprovanteUrl || '').trim();

  updates[`/repasses/${repasseId}/status`] = statusFinal;
  updates[`/repasses/${repasseId}/decididoPor`] = usuarioEmail;
  updates[`/repasses/${repasseId}/decididoEm`] = agora;
  updates[`/repasses/${repasseId}/modoRateio`] = modoRateioFinal;
  updates[`/repasses/${repasseId}/protocoloBancario`] = proto;
  updates[`/repasses/${repasseId}/comprovanteUrl`] = compr;
  updates[`/repasses/${repasseId}/assinaturaFinanceiro`] = {
    uid: auth.uid,
    email: usuarioEmail,
    acao: statusFinal === 'Pago' ? 'aprovar_e_pagar' : 'aprovar',
    assinadoEm: agora
  };
  updates[`/contas_pagar/cp_rep_${repasseId}/status`] = statusFinal === 'Pago' ? 'Paga' : 'Aprovada';

  if (statusFinal === 'Pago') {
    updates[`/repasses/${repasseId}/pagoPor`] = usuarioEmail;
    updates[`/repasses/${repasseId}/pagoEm`] = agora;
    updates[`/contas_pagar/cp_rep_${repasseId}/valorPago`] = Number(repasse.valorLiquido || repasse.valorSolicitado || 0);
    updates[`/lancamentos/lnc_rep_${repasseId}`] = {
      id: `lnc_rep_${repasseId}`,
      competencia: new Date().toISOString().slice(0, 7),
      dataLancamento: new Date().toISOString().slice(0, 10),
      produtoraId: repasse.produtoraId,
      eventoId: (repasse.eventoIds || [])[0] || null,
      origemModulo: 'Repasses',
      origemId: repasseId,
      contaDebito: '2.1.01.01 - Obrigações de Repasse Produtor',
      contaCredito: '1.1.01.02 - Conta Movimento Bancária Disk',
      valor: Number(repasse.valorSolicitado || 0),
      historico: `Aprovação e liquidação bancária repasse ${repasseId}`,
      usuario: usuarioEmail,
      criadoEm: agora
    };
  }
  updates[`/repasses/${repasseId}/memoriaCalculo`] = memoriaCalculo;

  await db.ref().update(updates);
  await registrarAuditoria({
    usuario: usuarioEmail,
    modulo: 'Repasses',
    eventoId: (repasse.eventoIds || []).join(', '),
    acao: statusFinal === 'Pago' ? 'Aprovação e Pagamento de Repasse' : 'Aprovação de Repasse',
    resumo: `Repasse ${repasseId} (${statusFinal}) — R$ ${Number(repasse.valorSolicitado).toFixed(2)} via ${repasse.forma} (rateio ${modoRateioFinal}).`
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
  await registrarAuditoria({
    usuario: auth.token.email || auth.uid,
    modulo: 'Antecipacoes',
    eventoId,
    acao: 'Solicitação de Antecipação',
    resumo: `Antecipação ${novaAntRef.key} solicitada por ${produtoraId} — R$ ${payload.valor.toFixed(2)}.`
  });
  logger.info(`[solicitarAntecipacao] Antecipação ${novaAntRef.key} solicitada por ${produtoraId}`, payload);
  return { id: novaAntRef.key, ...payload };
});
