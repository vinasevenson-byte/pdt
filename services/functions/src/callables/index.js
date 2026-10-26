/**
 * Callables HTTPS (`solicitarRepasse`, `decidirRepasse`, `solicitarAntecipacao`)
 * Fluxo completo com:
 * - Máquina de estados estrita (Solicitado -> Aprovado | Recusado | Pago; Aprovado -> Pago)
 * - Transação atômica contra concorrência de operadores
 * - Verificação obrigatória de competência aberta em /fechamentos
 * - Consistência em centavos entre Contas a Pagar e Ledger (com Plano de Contas e fuso America/Sao_Paulo)
 * - Assinatura eletrônica de aceite, aprovação, liquidação e trilha de auditoria.
 */

'use strict';

const {
  db: defaultDb,
  logger,
  httpsV2,
  toCents,
  fromCents,
  round2,
  formatarDataHoraBR,
  obterDataAtualBR,
  obterCompetenciaAtualBR,
  competenciaEstaFechada,
  PLANO_CONTAS,
  registrarAuditoria,
  recalcularTodaProdutora,
  calcTransferencia,
  calcularRateioRepasse,
  criarLancamentoPartidaDobrada
} = require('../shared/recalculo');

const { onCall, HttpsError } = httpsV2;

/**
 * Máquina de estados formal para transição de um Repasse.
 * Estados válidos:
 * - Solicitado -> Aprovado (acao: 'aprovar')
 * - Solicitado -> Recusado (acao: 'recusar')
 * - Solicitado -> Pago     (acao: 'pagar' — aprova e liquida em 1 passo)
 * - Aprovado   -> Pago     (acao: 'pagar' — liquida repasse já aprovado sem refazer rateio)
 * Estados terminais: 'Pago' e 'Recusado' (nenhuma ação permitida).
 */
function validarTransicaoRepasse(statusAtual, acao) {
  if (!['aprovar', 'recusar', 'pagar'].includes(acao)) {
    return {
      permitido: false,
      codigoErro: 'invalid-argument',
      mensagem: 'Parâmetros inválidos. Informe acao ("aprovar", "recusar" ou "pagar").'
    };
  }

  if (statusAtual === 'EmProcessamento') {
    return {
      permitido: false,
      codigoErro: 'aborted',
      mensagem: 'Conflito de concorrência: este repasse já está sendo processado por outro operador neste instante.'
    };
  }

  if (statusAtual === 'Pago' || statusAtual === 'Recusado') {
    return {
      permitido: false,
      codigoErro: 'failed-precondition',
      mensagem: `Transição inválida: o repasse já se encontra encerrado com status "${statusAtual}" e não permite a ação "${acao}".`
    };
  }

  if (acao === 'recusar') {
    if (statusAtual !== 'Solicitado') {
      return {
        permitido: false,
        codigoErro: 'failed-precondition',
        mensagem: `Transição inválida: não é permitido recusar um repasse com status "${statusAtual}" (rateio já aplicado).`
      };
    }
    return { permitido: true, modoExecucao: 'recusar_solicitado', statusDestino: 'Recusado' };
  }

  if (acao === 'aprovar') {
    if (statusAtual !== 'Solicitado') {
      return {
        permitido: false,
        codigoErro: 'failed-precondition',
        mensagem: `Transição inválida: o repasse já possui status "${statusAtual}" e não pode ser aprovado novamente.`
      };
    }
    return { permitido: true, modoExecucao: 'aprovar_solicitado', statusDestino: 'Aprovado' };
  }

  // acao === 'pagar'
  if (statusAtual === 'Solicitado') {
    return { permitido: true, modoExecucao: 'aprovar_e_pagar', statusDestino: 'Pago' };
  }
  if (statusAtual === 'Aprovado') {
    return { permitido: true, modoExecucao: 'liquidar_aprovado', statusDestino: 'Pago' };
  }

  return {
    permitido: false,
    codigoErro: 'failed-precondition',
    mensagem: `Status atual "${statusAtual}" inválido para a ação "${acao}".`
  };
}

const LOCK_TTL_MS = 5 * 60 * 1000; // Expiração de 5 minutos para lock transacional órfão

/**
 * Adquire lock transacional atômico no nó /repasses/{repasseId} para impedir corrida entre dois operadores.
 * Se houver um lock com mais de 5 minutos (_lockEmMs expirado), recupera a partir de _statusAnterior.
 */
async function adquirirLockTransacionalRepasse(customDb, repasseId, acao, usuarioEmail, agora, nowMs = Date.now()) {
  const repRef = customDb.ref(`/repasses/${repasseId}`);

  if (typeof repRef.transaction === 'function') {
    let erroValidacao = null;
    let snapshotAnterior = null;

    const txResult = await repRef.transaction((current) => {
      if (current === null) {
        return current;
      }
      const lockExpirado =
        current.status === 'EmProcessamento' &&
        current._statusAnterior &&
        current._lockEmMs &&
        nowMs - Number(current._lockEmMs) > LOCK_TTL_MS;

      const statusEfetivo = lockExpirado ? current._statusAnterior : current.status;
      const check = validarTransicaoRepasse(statusEfetivo, acao);
      if (!check.permitido) {
        erroValidacao = check;
        return; // aborta transação
      }
      snapshotAnterior = { ...current, status: statusEfetivo };
      return {
        ...current,
        status: 'EmProcessamento',
        _statusAnterior: statusEfetivo,
        _lockOperador: usuarioEmail,
        _lockEm: agora,
        _lockEmMs: nowMs
      };
    });

    if (erroValidacao) {
      throw new HttpsError(erroValidacao.codigoErro, erroValidacao.mensagem);
    }
    if (!txResult.committed) {
      const snapCheck = await repRef.get();
      if (!snapCheck.exists()) {
        throw new HttpsError('not-found', 'Solicitação de repasse não encontrada.');
      }
      const check = validarTransicaoRepasse(snapCheck.val().status, acao);
      throw new HttpsError(
        check.permitido ? 'aborted' : check.codigoErro,
        check.permitido ? 'Conflito de concorrência ao processar repasse.' : check.mensagem
      );
    }

    const valComLock = txResult.snapshot.val();
    const repasseOriginal = snapshotAnterior || { ...valComLock, status: valComLock._statusAnterior };
    const transicao = validarTransicaoRepasse(repasseOriginal.status, acao);
    return { repasseOriginal, transicao };
  }

  // Fallback caso o ref não implemente .transaction
  const repSnap = await repRef.get();
  if (!repSnap.exists()) {
    throw new HttpsError('not-found', 'Solicitação de repasse não encontrada.');
  }
  const repasseOriginal = repSnap.val();
  const transicao = validarTransicaoRepasse(repasseOriginal.status, acao);
  if (!transicao.permitido) {
    throw new HttpsError(transicao.codigoErro, transicao.mensagem);
  }
  await repRef.update({
    status: 'EmProcessamento',
    _statusAnterior: repasseOriginal.status,
    _lockOperador: usuarioEmail,
    _lockEm: agora
  });
  return { repasseOriginal, transicao };
}

async function liberarLockComRollback(customDb, repasseId, statusAnterior) {
  await customDb.ref(`/repasses/${repasseId}`).update({
    status: statusAnterior,
    _statusAnterior: null,
    _lockOperador: null,
    _lockEm: null
  });
}

/**
 * Monta os lançamentos de partida dobrada para liquidação bancária de um repasse,
 * validando obrigatoriamente se a competência (fuso America/Sao_Paulo) está aberta em /fechamentos.
 */
function construirLancamentosLiquidacaoRepasse({
  repasseId,
  repasse,
  usuarioEmail,
  agora,
  dataContabilBR,
  competenciaBR,
  protocoloBancario,
  historicoPrefixo,
  fechamentosMap
}) {
  const valorSolicitadoCents = toCents(repasse.valorSolicitado || 0);
  const tarifaCents = toCents(repasse.tarifaTransferencia || 0);
  const valorLiquidoCents = repasse.valorLiquido !== undefined
    ? toCents(repasse.valorLiquido)
    : Math.max(0, valorSolicitadoCents - tarifaCents);

  const lancamentoPrincipal = criarLancamentoPartidaDobrada(
    {
      id: `lnc_rep_${repasseId}`,
      data: dataContabilBR,
      competencia: competenciaBR,
      produtoraId: repasse.produtoraId,
      eventoId: (repasse.eventoIds || [])[0] || null,
      origemModulo: 'Repasses',
      origemId: repasseId,
      contaDebito: PLANO_CONTAS.OBRIGACOES_REPASSES_PRODUTOR,
      contaCredito: PLANO_CONTAS.BANCO_CONTA_MOVIMENTO,
      valorCents: valorLiquidoCents,
      historico: `${historicoPrefixo} repasse ${repasseId} (${protocoloBancario || repasse.forma || 'PIX/TED'})`,
      usuario: usuarioEmail,
      criadoPor: usuarioEmail,
      criadoEm: agora
    },
    fechamentosMap
  );

  let lancamentoTarifa = null;
  if (tarifaCents > 0) {
    lancamentoTarifa = criarLancamentoPartidaDobrada(
      {
        id: `lnc_tar_${repasseId}`,
        data: dataContabilBR,
        competencia: competenciaBR,
        produtoraId: repasse.produtoraId,
        eventoId: (repasse.eventoIds || [])[0] || null,
        origemModulo: 'Repasses',
        origemId: repasseId,
        contaDebito: PLANO_CONTAS.OBRIGACOES_REPASSES_PRODUTOR,
        contaCredito: PLANO_CONTAS.RECEITA_TARIFA_TRANSFERENCIA,
        valorCents: tarifaCents,
        historico: `Retenção de tarifa bancária (${repasse.forma || 'TED'}) sobre repasse ${repasseId}`,
        usuario: usuarioEmail,
        criadoPor: usuarioEmail,
        criadoEm: agora
      },
      fechamentosMap
    );
  }

  return {
    valorLiquidoCents,
    valorLiquido: fromCents(valorLiquidoCents),
    tarifaCents,
    tarifa: fromCents(tarifaCents),
    lancamentoPrincipal,
    lancamentoTarifa
  };
}

async function executarSolicitarRepasse(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
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
  const valorSolicitado = round2(valor || 0);
  if (!Number.isFinite(valorSolicitado) || toCents(valorSolicitado) <= 0) {
    throw new HttpsError('invalid-argument', 'Informe um valor de repasse maior que zero.');
  }

  const contaSnap = await customDb.ref(`/contas/${produtoraId}/${contaId}`).get();
  if (!contaSnap.exists() || contaSnap.val().status !== 'Validada') {
    throw new HttpsError('failed-precondition', 'A conta bancária selecionada não existe ou ainda não foi validada pelo Financeiro.');
  }

  const { eventosCalculados, cons, cfgTransferencia } = await recalcularTodaProdutora(produtoraId, null, customDb);

  for (const evId of eventoIds) {
    const evCalc = eventosCalculados.find(e => e.id === evId);
    if (!evCalc) {
      throw new HttpsError('permission-denied', `O evento ${evId} não pertence à sua produtora.`);
    }
    if (!evCalc.liberadoParaSolicitacao || toCents(evCalc.liberavel) <= 0) {
      throw new HttpsError('failed-precondition', `O evento "${evCalc.nome}" não possui saldo liberado para solicitação.`);
    }
  }

  const disponivelServidor = cons.disponivel(eventoIds);
  if (toCents(valorSolicitado) > toCents(disponivelServidor)) {
    throw new HttpsError(
      'failed-precondition',
      `O valor solicitado (R$ ${valorSolicitado.toFixed(2)}) excede o saldo disponível recalculado no servidor (R$ ${disponivelServidor.toFixed(2)}).`
    );
  }

  const transf = calcTransferencia(valorSolicitado, forma, cfgTransferencia);
  if (toCents(transf.valorLiquido) <= 0) {
    throw new HttpsError('invalid-argument', 'O valor líquido após tarifa de transferência deve ser maior que zero.');
  }

  const agora = formatarDataHoraBR(nowDate);
  const solicitanteEmail = auth.token.email || auth.uid;

  const novoRepRef = customDb.ref('/repasses').push();
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
    valorSolicitadoCents: toCents(transf.valorBruto),
    tarifaTransferencia: transf.tarifa,
    tarifaTransferenciaCents: toCents(transf.tarifa),
    valorLiquido: transf.valorLiquido,
    valorLiquidoCents: toCents(transf.valorLiquido),
    forma: transf.forma,
    contaId,
    status: 'Solicitado',
    solicitadoEm: agora,
    assinaturaSolicitante
  };

  await novoRepRef.set(payload);

  // Registra obrigação prevista em Contas a Pagar consistente com valorLiquido e centavos
  await customDb.ref(`/contas_pagar/cp_rep_${repasseId}`).set({
    id: `cp_rep_${repasseId}`,
    natureza: 'pagar',
    produtoraId,
    eventoId: eventoIds[0],
    repasseId,
    categoria: 'Repasse Produtor',
    fornecedor: produtoraId,
    valor: transf.valorLiquido,
    valorCents: toCents(transf.valorLiquido),
    valorOriginal: transf.valorLiquido,
    valorBrutoSolicitado: transf.valorBruto,
    tarifaTransferencia: transf.tarifa,
    valorPago: 0,
    valorBaixadoCents: 0,
    status: 'Prevista',
    criadoEm: agora
  });

  await registrarAuditoria(
    {
      usuario: solicitanteEmail,
      modulo: 'Repasses',
      eventoId: eventoIds.join(', '),
      acao: 'Solicitação de Repasse Assinada',
      resumo: `Repasse ${repasseId} solicitado por ${solicitanteEmail} (${produtoraId}) — Bruto R$ ${transf.valorBruto.toFixed(2)} / Líquido R$ ${transf.valorLiquido.toFixed(2)} via ${transf.forma}.`
    },
    customDb
  );

  logger.info(`[solicitarRepasse] Repasse ${repasseId} criado para ${produtoraId}`, payload);

  return { id: repasseId, ...payload };
}

async function executarDecidirRepasse(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Apenas usuários do perfil Financeiro podem aprovar ou recusar repasses.');
  }

  const { repasseId, acao, motivo, modoRateio, rateioManual, protocoloBancario, comprovanteUrl } = request.data || {};
  if (!repasseId || !['aprovar', 'recusar', 'pagar'].includes(acao)) {
    throw new HttpsError('invalid-argument', 'Parâmetros inválidos. Informe repasseId e acao ("aprovar", "recusar" ou "pagar").');
  }

  if (acao === 'recusar' && (!motivo || String(motivo).trim().length < 3)) {
    throw new HttpsError('invalid-argument', 'Informe obrigatoriamente o motivo da recusa.');
  }

  const usuarioEmail = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const dataContabilBR = obterDataAtualBR(nowDate);
  const competenciaBR = obterCompetenciaAtualBR(nowDate);

  // 1. Adquire lock transacional atômico (com expiração de 5 min) e valida a máquina de estados
  const { repasseOriginal: repasse, transicao } = await adquirirLockTransacionalRepasse(
    customDb,
    repasseId,
    acao,
    usuarioEmail,
    agora,
    nowDate instanceof Date ? nowDate.getTime() : Date.now()
  );

  try {
    // 2. Se a ação envolve pagamento (Solicitado -> Pago ou Aprovado -> Pago), verifica /fechamentos ANTES de alterar dados
    let fechamentosMap = {};
    if (transicao.statusDestino === 'Pago') {
      const fechSnap = await customDb.ref('/fechamentos').get();
      fechamentosMap = (fechSnap && fechSnap.val()) || {};
      if (competenciaEstaFechada(competenciaBR, fechamentosMap)) {
        throw new HttpsError(
          'failed-precondition',
          `A competência ${competenciaBR} está encerrada em /fechamentos e bloqueia lançamentos de liquidação.`
        );
      }
    }

    // 3. Caso A: Recusar um repasse Solicitado (Solicitado -> Recusado)
    if (transicao.modoExecucao === 'recusar_solicitado') {
      const updRecusa = {
        status: 'Recusado',
        motivoRecusa: String(motivo).trim(),
        decididoPor: usuarioEmail,
        decididoEm: agora,
        _statusAnterior: null,
        _lockOperador: null,
        _lockEm: null,
        assinaturaFinanceiro: {
          uid: auth.uid,
          email: usuarioEmail,
          acao: 'recusar',
          assinadoEm: agora
        }
      };
      await customDb.ref(`/repasses/${repasseId}`).update(updRecusa);
      await customDb.ref(`/contas_pagar/cp_rep_${repasseId}/status`).set('Cancelada');
      await registrarAuditoria(
        {
          usuario: usuarioEmail,
          modulo: 'Repasses',
          eventoId: (repasse.eventoIds || []).join(', '),
          acao: 'Recusa de Repasse',
          resumo: `Repasse ${repasseId} recusado (${String(motivo).trim()})`
        },
        customDb
      );
      return { status: 'Recusado' };
    }

    // 4. Caso B: Liquidar repasse que já estava Aprovado (Aprovado -> Pago)
    // IMPORTANTE: Não refaz o rateio nem soma jaRepassado novamente!
    if (transicao.modoExecucao === 'liquidar_aprovado') {
      const proto = String(protocoloBancario || repasse.protocoloBancario || '').trim();
      const compr = String(comprovanteUrl || repasse.comprovanteUrl || '').trim();

      const {
        valorLiquido,
        valorLiquidoCents,
        lancamentoPrincipal,
        lancamentoTarifa
      } = construirLancamentosLiquidacaoRepasse({
        repasseId,
        repasse,
        usuarioEmail,
        agora,
        dataContabilBR,
        competenciaBR,
        protocoloBancario: proto,
        historicoPrefixo: 'Liquidação bancária',
        fechamentosMap
      });

      const updatesPago = {
        [`/repasses/${repasseId}/status`]: 'Pago',
        [`/repasses/${repasseId}/pagoPor`]: usuarioEmail,
        [`/repasses/${repasseId}/pagoEm`]: agora,
        [`/repasses/${repasseId}/protocoloBancario`]: proto,
        [`/repasses/${repasseId}/comprovanteUrl`]: compr,
        [`/repasses/${repasseId}/_statusAnterior`]: null,
        [`/repasses/${repasseId}/_lockOperador`]: null,
        [`/repasses/${repasseId}/_lockEm`]: null,
        [`/repasses/${repasseId}/assinaturaLiquidacao`]: {
          uid: auth.uid,
          email: usuarioEmail,
          protocoloBancario: proto,
          assinadoEm: agora
        },
        [`/contas_pagar/cp_rep_${repasseId}/status`]: 'Paga',
        [`/contas_pagar/cp_rep_${repasseId}/valorPago`]: valorLiquido,
        [`/contas_pagar/cp_rep_${repasseId}/valorBaixado`]: valorLiquido,
        [`/contas_pagar/cp_rep_${repasseId}/valorBaixadoCents`]: valorLiquidoCents,
        [`/contas_pagar/cp_rep_${repasseId}/pagoEm`]: agora,
        [`/contas_pagar/cp_rep_${repasseId}/baixadoEm`]: dataContabilBR,
        [`/contas_pagar/cp_rep_${repasseId}/baixadoPor`]: usuarioEmail,
        [`/contas_pagar/cp_rep_${repasseId}/protocoloBancario`]: proto,
        [`/lancamentos/lnc_rep_${repasseId}`]: lancamentoPrincipal
      };

      if (lancamentoTarifa) {
        updatesPago[`/lancamentos/lnc_tar_${repasseId}`] = lancamentoTarifa;
      }

      await customDb.ref().update(updatesPago);
      await registrarAuditoria(
        {
          usuario: usuarioEmail,
          modulo: 'Repasses',
          eventoId: (repasse.eventoIds || []).join(', '),
          acao: 'Liquidação Bancária (Pago)',
          resumo: `Repasse ${repasseId} marcado como Pago (R$ ${valorLiquido.toFixed(2)}). Protocolo: ${proto || 'N/A'}`
        },
        customDb
      );
      await recalcularTodaProdutora(repasse.produtoraId, null, customDb);
      return { status: 'Pago', protocoloBancario: proto };
    }

    // 5. Caso C: Aprovar (Solicitado -> Aprovado) ou Aprovar e Pagar (Solicitado -> Pago)
    const { eventosCalculados, cons, advancedList, antecipacoesList } = await recalcularTodaProdutora(
      repasse.produtoraId,
      null,
      customDb
    );
    const selecionados = eventosCalculados.filter(e => (repasse.eventoIds || []).includes(e.id));
    const disponivelAtual = cons.disponivel(repasse.eventoIds || []);

    if (toCents(repasse.valorSolicitado) > toCents(disponivelAtual)) {
      const msgAutomatica = `Recusado automaticamente na validação: valor solicitado (R$ ${Number(repasse.valorSolicitado).toFixed(2)}) maior que o disponível atual (R$ ${disponivelAtual.toFixed(2)}).`;
      await customDb.ref(`/repasses/${repasseId}`).update({
        status: 'Recusado',
        motivoRecusa: msgAutomatica,
        decididoPor: usuarioEmail,
        decididoEm: agora,
        _statusAnterior: null,
        _lockOperador: null,
        _lockEm: null
      });
      await customDb.ref(`/contas_pagar/cp_rep_${repasseId}/status`).set('Cancelada');
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
      const quotaCents = toCents(rateioEventos[evCalc.id] || 0);
      updates[`/eventos/${evCalc.id}/jaRepassado`] = fromCents(toCents(evCalc.jaRepassado) + quotaCents);
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

    const statusFinal = transicao.statusDestino; // 'Aprovado' ou 'Pago'
    const proto = String(protocoloBancario || '').trim();
    const compr = String(comprovanteUrl || '').trim();

    updates[`/repasses/${repasseId}/status`] = statusFinal;
    updates[`/repasses/${repasseId}/decididoPor`] = usuarioEmail;
    updates[`/repasses/${repasseId}/decididoEm`] = agora;
    updates[`/repasses/${repasseId}/modoRateio`] = modoRateioFinal;
    updates[`/repasses/${repasseId}/protocoloBancario`] = proto;
    updates[`/repasses/${repasseId}/comprovanteUrl`] = compr;
    updates[`/repasses/${repasseId}/_statusAnterior`] = null;
    updates[`/repasses/${repasseId}/_lockOperador`] = null;
    updates[`/repasses/${repasseId}/_lockEm`] = null;
    updates[`/repasses/${repasseId}/assinaturaFinanceiro`] = {
      uid: auth.uid,
      email: usuarioEmail,
      acao: statusFinal === 'Pago' ? 'aprovar_e_pagar' : 'aprovar',
      assinadoEm: agora
    };
    updates[`/contas_pagar/cp_rep_${repasseId}/status`] = statusFinal === 'Pago' ? 'Paga' : 'Aprovada';

    if (statusFinal === 'Pago') {
      const {
        valorLiquido,
        valorLiquidoCents,
        lancamentoPrincipal,
        lancamentoTarifa
      } = construirLancamentosLiquidacaoRepasse({
        repasseId,
        repasse,
        usuarioEmail,
        agora,
        dataContabilBR,
        competenciaBR,
        protocoloBancario: proto,
        historicoPrefixo: 'Aprovação e liquidação bancária',
        fechamentosMap
      });

      updates[`/repasses/${repasseId}/pagoPor`] = usuarioEmail;
      updates[`/repasses/${repasseId}/pagoEm`] = agora;
      updates[`/repasses/${repasseId}/assinaturaLiquidacao`] = {
        uid: auth.uid,
        email: usuarioEmail,
        protocoloBancario: proto,
        assinadoEm: agora
      };
      updates[`/contas_pagar/cp_rep_${repasseId}/valorPago`] = valorLiquido;
      updates[`/contas_pagar/cp_rep_${repasseId}/valorBaixado`] = valorLiquido;
      updates[`/contas_pagar/cp_rep_${repasseId}/valorBaixadoCents`] = valorLiquidoCents;
      updates[`/contas_pagar/cp_rep_${repasseId}/pagoEm`] = agora;
      updates[`/contas_pagar/cp_rep_${repasseId}/baixadoEm`] = dataContabilBR;
      updates[`/contas_pagar/cp_rep_${repasseId}/baixadoPor`] = usuarioEmail;
      updates[`/contas_pagar/cp_rep_${repasseId}/protocoloBancario`] = proto;
      updates[`/lancamentos/lnc_rep_${repasseId}`] = lancamentoPrincipal;
      if (lancamentoTarifa) {
        updates[`/lancamentos/lnc_tar_${repasseId}`] = lancamentoTarifa;
      }
    }

    updates[`/repasses/${repasseId}/memoriaCalculo`] = memoriaCalculo;

    await customDb.ref().update(updates);
    await registrarAuditoria(
      {
        usuario: usuarioEmail,
        modulo: 'Repasses',
        eventoId: (repasse.eventoIds || []).join(', '),
        acao: statusFinal === 'Pago' ? 'Aprovação e Pagamento de Repasse' : 'Aprovação de Repasse',
        resumo: `Repasse ${repasseId} (${statusFinal}) — Bruto R$ ${Number(repasse.valorSolicitado).toFixed(2)} / Líquido R$ ${Number(repasse.valorLiquido || repasse.valorSolicitado).toFixed(2)} via ${repasse.forma} (rateio ${modoRateioFinal}).`
      },
      customDb
    );
    await recalcularTodaProdutora(repasse.produtoraId, null, customDb);

    return { status: statusFinal, memoriaCalculo };
  } catch (err) {
    // Se não foi a recusa automática por saldo insuficiente (que já definiu status = Recusado), restaura o status anterior
    const snapAtual = await customDb.ref(`/repasses/${repasseId}/status`).get();
    if (snapAtual.exists() && snapAtual.val() === 'EmProcessamento') {
      await liberarLockComRollback(customDb, repasseId, repasse.status);
    }
    if (err instanceof HttpsError) {
      throw err;
    }
    throw new HttpsError('failed-precondition', err.message || 'Erro ao processar decisão de repasse.');
  }
}

async function executarSolicitarAntecipacao(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || auth.token.role !== 'produtor' || !auth.token.produtoraId) {
    throw new HttpsError('permission-denied', 'Apenas produtores autenticados podem solicitar antecipação.');
  }

  const produtoraId = auth.token.produtoraId;
  const { eventoId, valor } = request.data || {};
  const valorSolicitado = round2(valor || 0);

  if (!eventoId || !Number.isFinite(valorSolicitado) || toCents(valorSolicitado) <= 0) {
    throw new HttpsError('invalid-argument', 'Informe um evento válido e um valor de antecipação maior que zero.');
  }

  const [cfgSnap, recalc] = await Promise.all([
    customDb.ref('/config/antecipacao').get(),
    recalcularTodaProdutora(produtoraId, null, customDb)
  ]);

  const cfg = cfgSnap.val() || { pctLimite: 50, taxaPct: 2 };
  const pctLimite = Number(cfg.pctLimite || 50);
  const taxaPct = Number(cfg.taxaPct || 2);

  const evCalc = recalc.eventosCalculados.find(e => e.id === eventoId);
  if (!evCalc) {
    throw new HttpsError('permission-denied', 'O evento informado não pertence à sua produtora.');
  }

  const jaAntecipadoCents = recalc.antecipacoesList
    .filter(a => a.eventoId === eventoId && a.status !== 'Recusada')
    .reduce((acc, a) => acc + toCents(a.valor || 0), 0);

  const tetoRetidoCents = Math.round((toCents(evCalc.retido) * pctLimite) / 100);
  const limiteDisponivel = fromCents(Math.max(0, tetoRetidoCents - jaAntecipadoCents));

  if (toCents(valorSolicitado) > toCents(limiteDisponivel)) {
    throw new HttpsError(
      'failed-precondition',
      `O valor solicitado (R$ ${valorSolicitado.toFixed(2)}) ultrapassa o limite disponível para antecipação neste evento (R$ ${limiteDisponivel.toFixed(2)}).`
    );
  }

  const novaAntRef = customDb.ref('/antecipacoes').push();
  const payload = {
    produtoraId,
    eventoId,
    data: obterDataAtualBR(nowDate),
    valor: valorSolicitado,
    valorCents: toCents(valorSolicitado),
    taxaPct,
    abaterNoProximo: true,
    status: 'Solicitada'
  };

  await novaAntRef.set(payload);
  await registrarAuditoria(
    {
      usuario: auth.token.email || auth.uid,
      modulo: 'Antecipacoes',
      eventoId,
      acao: 'Solicitação de Antecipação',
      resumo: `Antecipação ${novaAntRef.key} solicitada por ${produtoraId} — R$ ${payload.valor.toFixed(2)}.`
    },
    customDb
  );
  logger.info(`[solicitarAntecipacao] Antecipação ${novaAntRef.key} solicitada por ${produtoraId}`, payload);
  return { id: novaAntRef.key, ...payload };
}

exports.solicitarRepasse = onCall((request) => executarSolicitarRepasse(request));
exports.decidirRepasse = onCall((request) => executarDecidirRepasse(request));
exports.solicitarAntecipacao = onCall((request) => executarSolicitarAntecipacao(request));

// Exporta funções auxiliares para testes determinísticos da máquina de estados, concorrência e ledger
exports.validarTransicaoRepasse = validarTransicaoRepasse;
exports.executarSolicitarRepasse = executarSolicitarRepasse;
exports.executarDecidirRepasse = executarDecidirRepasse;
exports.executarSolicitarAntecipacao = executarSolicitarAntecipacao;
