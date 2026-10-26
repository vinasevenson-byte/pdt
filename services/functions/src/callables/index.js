/**
 * Callables HTTPS (`solicitarRepasse`, `decidirRepasse`, `estornarRepasse`, `solicitarAntecipacao`, `decidirAntecipacao`)
 * Fluxo completo com:
 * - Máquina de estados estrita para Repasses e Antecipações
 * - Transação atômica contra concorrência de operadores (TTL 5 min)
 * - RBAC granular (financeiro, aprovador, operador, auditor, fiscal, comercial, produtor)
 * - Alçada de Dupla Aprovação (4 olhos) configurável em /config/alcada
 * - Estorno / Cancelamento de Repasse Aprovado ou Pago (reversão de rateio, abatimentos, título e Ledger)
 * - Verificação obrigatória de competência aberta em /fechamentos
 * - Consistência em centavos entre Contas a Pagar e Ledger (com Plano de Contas e fuso America/Sao_Paulo)
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
  criarLancamentoPartidaDobrada,
  gerarEstornoLancamento,
  temPermissao,
  avaliarAlcadaDuplaAprovacao,
  publicarEventoDominio
} = require('../shared/recalculo');

const { onCall, HttpsError } = httpsV2;

/**
 * Máquina de estados formal para transição de um Repasse.
 * Estados válidos:
 * - Solicitado | AguardandoSegundaAprovacao -> Aprovado (acao: 'aprovar')
 * - Solicitado | AguardandoSegundaAprovacao -> Recusado (acao: 'recusar')
 * - Solicitado | AguardandoSegundaAprovacao -> Pago     (acao: 'pagar' — aprova e liquida em 1 passo)
 * - Aprovado                                -> Pago     (acao: 'pagar' — liquida repasse já aprovado sem refazer rateio)
 * - Aprovado                                -> Estornado (acao: 'estornar' — reverte jaRepassado, abatimentos e cancela CP)
 * - Pago                                    -> Estornado (acao: 'estornar' — reverte jaRepassado, abatimentos, CP e gera estorno no Ledger)
 * Estados terminais: 'Recusado' e 'Estornado'.
 */
function validarTransicaoRepasse(statusAtual, acao) {
  if (!['aprovar', 'recusar', 'pagar', 'estornar'].includes(acao)) {
    return {
      permitido: false,
      codigoErro: 'invalid-argument',
      mensagem: 'Parâmetros inválidos. Informe acao ("aprovar", "recusar", "pagar" ou "estornar").'
    };
  }

  if (statusAtual === 'EmProcessamento') {
    return {
      permitido: false,
      codigoErro: 'aborted',
      mensagem: 'Conflito de concorrência: este repasse já está sendo processado por outro operador neste instante.'
    };
  }

  if (acao === 'estornar') {
    if (statusAtual === 'Aprovado') {
      return { permitido: true, modoExecucao: 'estornar_aprovado', statusDestino: 'Estornado' };
    }
    if (statusAtual === 'Pago') {
      return { permitido: true, modoExecucao: 'estornar_pago', statusDestino: 'Estornado' };
    }
    return {
      permitido: false,
      codigoErro: 'failed-precondition',
      mensagem: `Transição inválida: apenas repasses com status "Aprovado" ou "Pago" podem ser estornados (status atual: "${statusAtual}").`
    };
  }

  if (statusAtual === 'Pago' || statusAtual === 'Recusado' || statusAtual === 'Estornado') {
    return {
      permitido: false,
      codigoErro: 'failed-precondition',
      mensagem: `Transição inválida: o repasse já se encontra encerrado com status "${statusAtual}" e não permite a ação "${acao}".`
    };
  }

  const emFaseAprovacao = statusAtual === 'Solicitado' || statusAtual === 'AguardandoSegundaAprovacao';

  if (acao === 'recusar') {
    if (!emFaseAprovacao) {
      return {
        permitido: false,
        codigoErro: 'failed-precondition',
        mensagem: `Transição inválida: não é permitido recusar um repasse com status "${statusAtual}" (rateio já aplicado). Utilize o estorno.`
      };
    }
    return { permitido: true, modoExecucao: 'recusar_solicitado', statusDestino: 'Recusado' };
  }

  if (acao === 'aprovar') {
    if (!emFaseAprovacao) {
      return {
        permitido: false,
        codigoErro: 'failed-precondition',
        mensagem: `Transição inválida: o repasse já possui status "${statusAtual}" e não pode ser aprovado novamente.`
      };
    }
    return { permitido: true, modoExecucao: 'aprovar_solicitado', statusDestino: 'Aprovado' };
  }

  // acao === 'pagar'
  if (emFaseAprovacao) {
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

/**
 * Máquina de estados formal para transição de uma Antecipação.
 * Estados válidos:
 * - Solicitada -> Aprovada  (acao: 'aprovar')
 * - Solicitada -> Recusada  (acao: 'recusar')
 * - Solicitada -> Paga      (acao: 'pagar')
 * - Aprovada   -> Paga      (acao: 'pagar')
 * - Aprovada   -> Estornada (acao: 'estornar')
 * - Paga       -> Estornada (acao: 'estornar')
 * Estados terminais: 'Recusada' e 'Estornada'.
 */
function validarTransicaoAntecipacao(statusAtual, acao) {
  if (!['aprovar', 'recusar', 'pagar', 'estornar'].includes(acao)) {
    return {
      permitido: false,
      codigoErro: 'invalid-argument',
      mensagem: 'Parâmetros inválidos. Informe acao ("aprovar", "recusar", "pagar" ou "estornar").'
    };
  }

  if (statusAtual === 'EmProcessamento') {
    return {
      permitido: false,
      codigoErro: 'aborted',
      mensagem: 'Conflito de concorrência: esta antecipação já está sendo processada por outro operador.'
    };
  }

  if (acao === 'estornar') {
    if (statusAtual === 'Aprovada') {
      return { permitido: true, modoExecucao: 'estornar_aprovada', statusDestino: 'Estornada' };
    }
    if (statusAtual === 'Paga') {
      return { permitido: true, modoExecucao: 'estornar_paga', statusDestino: 'Estornada' };
    }
    return {
      permitido: false,
      codigoErro: 'failed-precondition',
      mensagem: `Transição inválida: apenas antecipações com status "Aprovada" ou "Paga" podem ser estornadas (status atual: "${statusAtual}").`
    };
  }

  if (statusAtual === 'Paga' || statusAtual === 'Recusada' || statusAtual === 'Estornada') {
    return {
      permitido: false,
      codigoErro: 'failed-precondition',
      mensagem: `Transição inválida: a antecipação já se encontra encerrada com status "${statusAtual}" e não permite a ação "${acao}".`
    };
  }

  if (acao === 'recusar') {
    if (statusAtual !== 'Solicitada') {
      return {
        permitido: false,
        codigoErro: 'failed-precondition',
        mensagem: `Transição inválida: não é permitido recusar uma antecipação com status "${statusAtual}".`
      };
    }
    return { permitido: true, modoExecucao: 'recusar_solicitada', statusDestino: 'Recusada' };
  }

  if (acao === 'aprovar') {
    if (statusAtual !== 'Solicitada') {
      return {
        permitido: false,
        codigoErro: 'failed-precondition',
        mensagem: `Transição inválida: a antecipação já possui status "${statusAtual}" e não pode ser aprovada novamente.`
      };
    }
    return { permitido: true, modoExecucao: 'aprovar_solicitada', statusDestino: 'Aprovada' };
  }

  // acao === 'pagar'
  if (statusAtual === 'Solicitada') {
    return { permitido: true, modoExecucao: 'aprovar_e_pagar', statusDestino: 'Paga' };
  }
  if (statusAtual === 'Aprovada') {
    return { permitido: true, modoExecucao: 'liquidar_aprovada', statusDestino: 'Paga' };
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
    _lockEm: null,
    _lockEmMs: null
  });
}

/**
 * Ajusta atomicamente /eventos/{evId}/jaRepassado usando .transaction() para evitar corrida
 * caso dois repasses distintos do mesmo evento sejam aprovados ou estornados simultaneamente.
 */
async function ajustarJaRepassadoAtomico(customDb, evId, deltaCents) {
  const jaRepRef = customDb.ref(`/eventos/${evId}/jaRepassado`);
  if (typeof jaRepRef.transaction === 'function') {
    await jaRepRef.transaction((atual) => {
      const atualCents = toCents(atual || 0);
      return fromCents(Math.max(0, atualCents + deltaCents));
    });
    return;
  }
  const snap = await jaRepRef.get();
  const atualCents = toCents(snap.exists() ? snap.val() : 0);
  await jaRepRef.set(fromCents(Math.max(0, atualCents + deltaCents)));
}

/**
 * Adquire lock transacional atômico em /antecipacoes/{antId}
 */
async function adquirirLockTransacionalAntecipacao(customDb, antId, acao, usuarioEmail, agora, nowMs = Date.now()) {
  const antRef = customDb.ref(`/antecipacoes/${antId}`);

  if (typeof antRef.transaction === 'function') {
    let erroValidacao = null;
    let snapshotAnterior = null;

    const txResult = await antRef.transaction((current) => {
      if (current === null) {
        return current;
      }
      const lockExpirado =
        current.status === 'EmProcessamento' &&
        current._statusAnterior &&
        current._lockEmMs &&
        nowMs - Number(current._lockEmMs) > LOCK_TTL_MS;

      const statusEfetivo = lockExpirado ? current._statusAnterior : current.status;
      const check = validarTransicaoAntecipacao(statusEfetivo, acao);
      if (!check.permitido) {
        erroValidacao = check;
        return;
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
      const snapCheck = await antRef.get();
      if (!snapCheck.exists()) {
        throw new HttpsError('not-found', 'Solicitação de antecipação não encontrada.');
      }
      const check = validarTransicaoAntecipacao(snapCheck.val().status, acao);
      throw new HttpsError(
        check.permitido ? 'aborted' : check.codigoErro,
        check.permitido ? 'Conflito de concorrência ao processar antecipação.' : check.mensagem
      );
    }

    const valComLock = txResult.snapshot.val();
    const antOriginal = snapshotAnterior || { ...valComLock, status: valComLock._statusAnterior };
    const transicao = validarTransicaoAntecipacao(antOriginal.status, acao);
    return { antOriginal, transicao };
  }

  const antSnap = await antRef.get();
  if (!antSnap.exists()) {
    throw new HttpsError('not-found', 'Solicitação de antecipação não encontrada.');
  }
  const antOriginal = antSnap.val();
  const transicao = validarTransicaoAntecipacao(antOriginal.status, acao);
  if (!transicao.permitido) {
    throw new HttpsError(transicao.codigoErro, transicao.mensagem);
  }
  await antRef.update({
    status: 'EmProcessamento',
    _statusAnterior: antOriginal.status,
    _lockOperador: usuarioEmail,
    _lockEm: agora
  });
  return { antOriginal, transicao };
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

  if (!auth || !temPermissao(auth.token, 'repasse:solicitar') || !auth.token.produtoraId) {
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

/**
 * Estorno / Cancelamento de Repasse Aprovado ou Pago.
 * - Aprovado: cancelamento (devolve jaRepassado, restaura abatimentos registrados, cancela CP, sem lançamento no ledger)
 * - Pago: devolução (exige protocolo de devolução bancária, valida competência aberta, gera contrapartidas inversas no ledger)
 * - Segregação: quem aprovou/liquidou o repasse não pode estorná-lo (salvo ESTORNO_SEGREGACAO=false em dev)
 * - Isolamento do Produtor: o produtor vê apenas status='Estornado'; o motivo interno fica restrito a /estornos
 * - Repasses legados sem abatimentosAplicados retornam restauracaoAbatimentos='manual' com advertência na auditoria
 */
async function executarEstornarRepasse(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'repasse:estornar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas usuários com permissão "repasse:estornar" (Financeiro ou Aprovador) podem estornar repasses aprovados ou pagos.'
    );
  }

  const { repasseId, motivo, protocoloDevolucao, protocoloBancario } = request.data || {};
  if (!repasseId || !motivo || String(motivo).trim().length < 3) {
    throw new HttpsError('invalid-argument', 'Informe obrigatoriamente repasseId e o motivo do estorno (mínimo 3 caracteres).');
  }

  const usuarioEmail = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const dataContabilBR = obterDataAtualBR(nowDate);
  const competenciaBR = obterCompetenciaAtualBR(nowDate);
  const motivoLimpo = String(motivo).trim();
  const protoDevolucao = String(protocoloDevolucao || protocoloBancario || '').trim();

  const { repasseOriginal: repasse, transicao } = await adquirirLockTransacionalRepasse(
    customDb,
    repasseId,
    'estornar',
    usuarioEmail,
    agora,
    nowDate instanceof Date ? nowDate.getTime() : Date.now()
  );

  try {
    // 1. Segregação de funções: quem liquidou (ou aprovou) não pode estornar, salvo ESTORNO_SEGREGACAO=false
    const segregacaoAtiva =
      deps.estornoSegregacao !== undefined
        ? Boolean(deps.estornoSegregacao)
        : process.env.ESTORNO_SEGREGACAO !== 'false';

    if (segregacaoAtiva) {
      const uidLiquidacao = repasse.assinaturaLiquidacao && repasse.assinaturaLiquidacao.uid;
      const emailLiquidacao = repasse.pagoPor || (repasse.assinaturaLiquidacao && repasse.assinaturaLiquidacao.email);
      const uidAprovacao = repasse.assinaturaFinanceiro && repasse.assinaturaFinanceiro.uid;
      const emailAprovacao = repasse.decididoPor || (repasse.assinaturaFinanceiro && repasse.assinaturaFinanceiro.email);

      const mesmoLiquidador =
        transicao.modoExecucao === 'estornar_pago' &&
        ((auth.uid && uidLiquidacao && auth.uid === uidLiquidacao) ||
          (usuarioEmail && emailLiquidacao && usuarioEmail === emailLiquidacao));

      const mesmoAprovador =
        transicao.modoExecucao === 'estornar_aprovado' &&
        ((auth.uid && uidAprovacao && auth.uid === uidAprovacao) ||
          (usuarioEmail && emailAprovacao && usuarioEmail === emailAprovacao));

      if (mesmoLiquidador || mesmoAprovador) {
        throw new HttpsError(
          'failed-precondition',
          `Segregação de funções: o operador (${usuarioEmail}) que ${transicao.modoExecucao === 'estornar_pago' ? 'liquidou' : 'aprovou'} o repasse não pode estorná-lo.`
        );
      }
    }

    // 2. Se estava Pago, exige protocolo de devolução bancária e competência aberta em /fechamentos
    let fechamentosMap = {};
    if (transicao.modoExecucao === 'estornar_pago') {
      if (!protoDevolucao || protoDevolucao.length < 3) {
        throw new HttpsError(
          'invalid-argument',
          'Para estornar um repasse já Pago, informe obrigatoriamente o protocolo da devolução bancária (protocoloDevolucao).'
        );
      }
      const fechSnap = await customDb.ref('/fechamentos').get();
      fechamentosMap = (fechSnap && fechSnap.val()) || {};
      if (competenciaEstaFechada(competenciaBR, fechamentosMap)) {
        throw new HttpsError(
          'failed-precondition',
          `A competência ${competenciaBR} está encerrada em /fechamentos e bloqueia o estorno contábil de repasse pago.`
        );
      }
    }

    const updates = {};
    const mem = repasse.memoriaCalculo || {};
    const rateioAplicado = mem.rateioAplicado || {};

    // 3. Reverte jaRepassado de cada evento de forma atômica usando o rateio gravado na memória de cálculo
    for (const [evId, quotaVal] of Object.entries(rateioAplicado)) {
      const evSnap = await customDb.ref(`/eventos/${evId}`).get();
      if (evSnap.exists()) {
        const quotaCents = toCents(quotaVal || 0);
        await ajustarJaRepassadoAtomico(customDb, evId, -quotaCents);
      }
    }

    // 4. Restaura abaterNoProximo = true nos itens de advanced e antecipacoes registrados em abatimentosAplicados
    const abatimentos = mem.abatimentosAplicados || null;
    let restauracaoAbatimentos = 'manual';
    if (abatimentos && (Array.isArray(abatimentos.advancedIds) || Array.isArray(abatimentos.antecipacaoIds))) {
      restauracaoAbatimentos = 'automatica';
      for (const advId of abatimentos.advancedIds || []) {
        updates[`/advanced/${advId}/abaterNoProximo`] = true;
      }
      for (const antId of abatimentos.antecipacaoIds || []) {
        updates[`/antecipacoes/${antId}/abaterNoProximo`] = true;
      }
    }

    // 5. Se estava Pago, gera lançamentos contábeis inversos no Ledger na competência atual
    const lancamentosEstornoIds = [];
    if (transicao.modoExecucao === 'estornar_pago') {
      const [lncRepSnap, lncTarSnap] = await Promise.all([
        customDb.ref(`/lancamentos/lnc_rep_${repasseId}`).get(),
        customDb.ref(`/lancamentos/lnc_tar_${repasseId}`).get()
      ]);

      if (lncRepSnap.exists()) {
        const estRepId = `lnc_est_rep_${repasseId}`;
        const estRep = gerarEstornoLancamento(
          { id: `lnc_rep_${repasseId}`, ...lncRepSnap.val() },
          {
            id: estRepId,
            motivo: `${motivoLimpo} (Protocolo devolução: ${protoDevolucao})`,
            data: dataContabilBR,
            competencia: competenciaBR,
            usuario: usuarioEmail
          },
          fechamentosMap
        );
        updates[`/lancamentos/${estRepId}`] = estRep;
        lancamentosEstornoIds.push(estRepId);
      }

      if (lncTarSnap.exists()) {
        const estTarId = `lnc_est_tar_${repasseId}`;
        const estTar = gerarEstornoLancamento(
          { id: `lnc_tar_${repasseId}`, ...lncTarSnap.val() },
          {
            id: estTarId,
            motivo: `${motivoLimpo} (Protocolo devolução: ${protoDevolucao})`,
            data: dataContabilBR,
            competencia: competenciaBR,
            usuario: usuarioEmail
          },
          fechamentosMap
        );
        updates[`/lancamentos/${estTarId}`] = estTar;
        lancamentosEstornoIds.push(estTarId);
      }
    }

    // 6. Atualiza Contas a Pagar, grava motivo interno em /estornos (oculto do Produtor) e atualiza /repasses
    updates[`/contas_pagar/cp_rep_${repasseId}/status`] = 'Cancelada';
    updates[`/contas_pagar/cp_rep_${repasseId}/estornadoEm`] = agora;

    const estornoId = `est_${repasseId}`;
    const registroEstorno = {
      id: estornoId,
      repasseId,
      produtoraId: repasse.produtoraId,
      eventoIds: repasse.eventoIds || [],
      statusAnterior: repasse.status,
      valorSolicitado: repasse.valorSolicitado,
      valorLiquido: repasse.valorLiquido,
      motivo: motivoLimpo,
      protocoloDevolucao: protoDevolucao || null,
      restauracaoAbatimentos,
      lancamentosEstornoIds,
      estornadoPor: usuarioEmail,
      estornadoEm: agora,
      assinaturaEstorno: {
        uid: auth.uid,
        email: usuarioEmail,
        protocoloDevolucao: protoDevolucao || null,
        assinadoEm: agora
      }
    };
    updates[`/estornos/${estornoId}`] = registroEstorno;

    // No nó /repasses (lido pelo produtor), grava apenas status='Estornado' e estornadoEm, SEM expor o motivo interno
    updates[`/repasses/${repasseId}/status`] = 'Estornado';
    updates[`/repasses/${repasseId}/estornadoEm`] = agora;
    updates[`/repasses/${repasseId}/_statusAnterior`] = null;
    updates[`/repasses/${repasseId}/_lockOperador`] = null;
    updates[`/repasses/${repasseId}/_lockEm`] = null;
    updates[`/repasses/${repasseId}/_lockEmMs`] = null;

    await customDb.ref().update(updates);

    const avisoManual =
      restauracaoAbatimentos === 'manual'
        ? ' [ATENÇÃO: repasse legado sem abatimentosAplicados; conferir advanced e antecipações manualmente]'
        : '';

    await registrarAuditoria(
      {
        usuario: usuarioEmail,
        modulo: 'Repasses',
        eventoId: (repasse.eventoIds || []).join(', '),
        acao: `Estorno de Repasse (${repasse.status} -> Estornado)`,
        resumo: `Repasse ${repasseId} estornado por ${usuarioEmail}. Motivo: ${motivoLimpo}.${protoDevolucao ? ` Protocolo devolução: ${protoDevolucao}.` : ''}${avisoManual}`
      },
      customDb
    );

    await publicarEventoDominio(customDb, {
      tipo: 'REPASSE_ESTORNADO',
      origemModulo: 'Repasses',
      referenciaId: repasseId,
      produtoraId: repasse.produtoraId,
      payload: {
        estornoId,
        statusAnterior: repasse.status,
        valorSolicitado: repasse.valorSolicitado,
        restauracaoAbatimentos,
        lancamentosEstornoIds
      },
      criadoEm: agora
    });

    await recalcularTodaProdutora(repasse.produtoraId, null, customDb);

    return {
      status: 'Estornado',
      estornoId,
      statusAnterior: repasse.status,
      restauracaoAbatimentos,
      lancamentosEstornoIds
    };
  } catch (err) {
    const snapAtual = await customDb.ref(`/repasses/${repasseId}/status`).get();
    if (snapAtual.exists() && snapAtual.val() === 'EmProcessamento') {
      await liberarLockComRollback(customDb, repasseId, repasse.status);
    }
    if (err instanceof HttpsError) {
      throw err;
    }
    throw new HttpsError('failed-precondition', err.message || 'Erro ao estornar repasse.');
  }
}

async function executarDecidirRepasse(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  const { repasseId, acao, motivo, modoRateio, rateioManual, protocoloBancario, comprovanteUrl } = request.data || {};
  if (!repasseId || !['aprovar', 'recusar', 'pagar', 'estornar'].includes(acao)) {
    throw new HttpsError('invalid-argument', 'Parâmetros inválidos. Informe repasseId e acao ("aprovar", "recusar", "pagar" ou "estornar").');
  }

  if (acao === 'estornar') {
    return executarEstornarRepasse(request, deps);
  }

  const permissaoNecessaria = `repasse:${acao}`;
  if (!auth || !temPermissao(auth.token, permissaoNecessaria)) {
    throw new HttpsError(
      'permission-denied',
      `Apenas usuários com permissão "${permissaoNecessaria}" podem executar a ação "${acao}" em repasses.`
    );
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

    // 3. Caso A: Recusar um repasse Solicitado ou AguardandoSegundaAprovacao (-> Recusado)
    if (transicao.modoExecucao === 'recusar_solicitado') {
      const updRecusa = {
        status: 'Recusado',
        motivoRecusa: String(motivo).trim(),
        decididoPor: usuarioEmail,
        decididoEm: agora,
        _statusAnterior: null,
        _lockOperador: null,
        _lockEm: null,
        _lockEmMs: null,
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
        [`/repasses/${repasseId}/_lockEmMs`]: null,
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
    // 5.1 Verifica política de Alçada de Dupla Aprovação (/config/alcada)
    const alcadaSnap = await customDb.ref('/config/alcada').get();
    const configAlcada = (alcadaSnap && alcadaSnap.val()) || {};
    const avaliacaoAlcada = avaliarAlcadaDuplaAprovacao({
      valor: repasse.valorSolicitado,
      configAlcada,
      primeiraAprovacao: repasse.primeiraAprovacao || null,
      usuarioAtual: { uid: auth.uid, email: usuarioEmail },
      agora
    });

    if (avaliacaoAlcada.requerSegundaAprovacao && !avaliacaoAlcada.concluido) {
      await customDb.ref(`/repasses/${repasseId}`).update({
        status: 'AguardandoSegundaAprovacao',
        primeiraAprovacao: avaliacaoAlcada.primeiraAprovacao,
        _statusAnterior: null,
        _lockOperador: null,
        _lockEm: null,
        _lockEmMs: null
      });
      await registrarAuditoria(
        {
          usuario: usuarioEmail,
          modulo: 'Repasses',
          eventoId: (repasse.eventoIds || []).join(', '),
          acao: '1ª Aprovação de Alçada (Aguardando 2ª Aprovação)',
          resumo: `Repasse ${repasseId} (R$ ${Number(repasse.valorSolicitado).toFixed(2)}) recebeu 1ª aprovação de ${usuarioEmail} e aguarda 2º aprovador.`
        },
        customDb
      );
      return {
        status: 'AguardandoSegundaAprovacao',
        requerSegundaAprovacao: true,
        primeiraAprovacao: avaliacaoAlcada.primeiraAprovacao
      };
    }

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
        _lockEm: null,
        _lockEmMs: null
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
      await ajustarJaRepassadoAtomico(customDb, evCalc.id, quotaCents);
    }

    const advancedAbatidosIds = [];
    for (const adv of advancedList) {
      if (adv.abaterNoProximo && (adv.escopo === 'consolidado' || (repasse.eventoIds || []).includes(adv.escopo))) {
        updates[`/advanced/${adv.id}/abaterNoProximo`] = false;
        advancedAbatidosIds.push(adv.id);
      }
    }

    const antecipacoesAbatidasIds = [];
    for (const ant of antecipacoesList) {
      if (ant.abaterNoProximo && (repasse.eventoIds || []).includes(ant.eventoId) && (ant.status === 'Aprovada' || ant.status === 'Paga')) {
        updates[`/antecipacoes/${ant.id}/abaterNoProximo`] = false;
        antecipacoesAbatidasIds.push(ant.id);
      }
    }

    const memoriaCalculo = {
      aprovadoPor: usuarioEmail,
      aprovadoEm: agora,
      disponivelNoMomento: disponivelAtual,
      modoRateio: modoRateioFinal,
      rateioAplicado: rateioEventos,
      abatimentosAplicados: {
        advancedIds: advancedAbatidosIds,
        antecipacaoIds: antecipacoesAbatidasIds
      },
      duplaAprovacao: avaliacaoAlcada.requerSegundaAprovacao
        ? {
            primeiraAprovacao: avaliacaoAlcada.primeiraAprovacao,
            segundaAprovacao: avaliacaoAlcada.segundaAprovacao
          }
        : null,
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
    updates[`/repasses/${repasseId}/_lockEmMs`] = null;
    if (avaliacaoAlcada.segundaAprovacao) {
      updates[`/repasses/${repasseId}/segundaAprovacao`] = avaliacaoAlcada.segundaAprovacao;
    }
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

  if (!auth || !temPermissao(auth.token, 'antecipacao:solicitar') || !auth.token.produtoraId) {
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
  const antId = novaAntRef.key;
  const encargoCents = Math.round((toCents(valorSolicitado) * taxaPct) / 100);
  const payload = {
    produtoraId,
    eventoId,
    data: obterDataAtualBR(nowDate),
    valor: valorSolicitado,
    valorCents: toCents(valorSolicitado),
    taxaPct,
    encargo: fromCents(encargoCents),
    encargoCents,
    abaterNoProximo: true,
    status: 'Solicitada'
  };

  await novaAntRef.set(payload);
  await customDb.ref(`/contas_pagar/cp_ant_${antId}`).set({
    id: `cp_ant_${antId}`,
    natureza: 'pagar',
    produtoraId,
    eventoId,
    antecipacaoId: antId,
    categoria: 'Antecipação Produtor',
    fornecedor: produtoraId,
    valor: valorSolicitado,
    valorCents: toCents(valorSolicitado),
    valorOriginal: valorSolicitado,
    valorPago: 0,
    valorBaixadoCents: 0,
    status: 'Prevista',
    criadoEm: formatarDataHoraBR(nowDate)
  });

  await registrarAuditoria(
    {
      usuario: auth.token.email || auth.uid,
      modulo: 'Antecipacoes',
      eventoId,
      acao: 'Solicitação de Antecipação',
      resumo: `Antecipação ${antId} solicitada por ${produtoraId} — R$ ${payload.valor.toFixed(2)}.`
    },
    customDb
  );
  logger.info(`[solicitarAntecipacao] Antecipação ${antId} solicitada por ${produtoraId}`, payload);
  return { id: antId, ...payload };
}

/**
 * Decisão server-side para Antecipações com máquina de estados, lock transacional, estorno e lançamento no Ledger ao pagar.
 */
async function executarDecidirAntecipacao(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  const { antId, acao, motivo = '', protocoloBancario = '', protocoloDevolucao = '' } = request.data || {};
  if (!antId || !['aprovar', 'recusar', 'pagar', 'estornar'].includes(acao)) {
    throw new HttpsError('invalid-argument', 'Informe antId e acao ("aprovar", "recusar", "pagar" ou "estornar").');
  }

  const permissaoNecessaria = `antecipacao:${acao}`;
  if (!auth || !temPermissao(auth.token, permissaoNecessaria)) {
    throw new HttpsError(
      'permission-denied',
      `Apenas usuários com permissão "${permissaoNecessaria}" podem executar a ação "${acao}" em antecipações.`
    );
  }

  const usuarioEmail = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const dataContabilBR = obterDataAtualBR(nowDate);
  const competenciaBR = obterCompetenciaAtualBR(nowDate);
  const protoDevolucao = String(protocoloDevolucao || protocoloBancario || '').trim();

  const { antOriginal: ant, transicao } = await adquirirLockTransacionalAntecipacao(
    customDb,
    antId,
    acao,
    usuarioEmail,
    agora,
    nowDate instanceof Date ? nowDate.getTime() : Date.now()
  );

  try {
    let fechamentosMap = {};
    if (transicao.statusDestino === 'Paga' || transicao.modoExecucao === 'estornar_paga') {
      const fechSnap = await customDb.ref('/fechamentos').get();
      fechamentosMap = (fechSnap && fechSnap.val()) || {};
      if (competenciaEstaFechada(competenciaBR, fechamentosMap)) {
        throw new HttpsError(
          'failed-precondition',
          `A competência ${competenciaBR} está encerrada em /fechamentos e bloqueia movimentações contábeis de antecipação.`
        );
      }
    }

    // Caso Estorno de Antecipação (Aprovada -> Estornada ou Paga -> Estornada)
    if (transicao.modoExecucao === 'estornar_aprovada' || transicao.modoExecucao === 'estornar_paga') {
      if (!motivo || String(motivo).trim().length < 3) {
        throw new HttpsError('invalid-argument', 'Informe obrigatoriamente o motivo do estorno da antecipação (mínimo 3 caracteres).');
      }
      if (ant.abaterNoProximo === false) {
        throw new HttpsError(
          'failed-precondition',
          'Não é permitido estornar uma antecipação que já foi abatida em um repasse. Estorne o repasse correspondente primeiro.'
        );
      }

      const segregacaoAtiva =
        deps.estornoSegregacao !== undefined
          ? Boolean(deps.estornoSegregacao)
          : process.env.ESTORNO_SEGREGACAO !== 'false';

      if (segregacaoAtiva) {
        const operadorAnterior = transicao.modoExecucao === 'estornar_paga' ? (ant.pagoPor || ant.decididoPor) : ant.decididoPor;
        if (operadorAnterior && operadorAnterior === usuarioEmail) {
          throw new HttpsError(
            'failed-precondition',
            `Segregação de funções: o operador (${usuarioEmail}) que ${transicao.modoExecucao === 'estornar_paga' ? 'liquidou' : 'aprovou'} a antecipação não pode estorná-la.`
          );
        }
      }

      const updatesEstorno = {
        [`/antecipacoes/${antId}/status`]: 'Estornada',
        [`/antecipacoes/${antId}/abaterNoProximo`]: false,
        [`/antecipacoes/${antId}/estornadoEm`]: agora,
        [`/antecipacoes/${antId}/_statusAnterior`]: null,
        [`/antecipacoes/${antId}/_lockOperador`]: null,
        [`/antecipacoes/${antId}/_lockEm`]: null,
        [`/antecipacoes/${antId}/_lockEmMs`]: null,
        [`/contas_pagar/cp_ant_${antId}/status`]: 'Cancelada'
      };

      const lancamentosEstornoIds = [];
      if (transicao.modoExecucao === 'estornar_paga') {
        if (!protoDevolucao || protoDevolucao.length < 3) {
          throw new HttpsError(
            'invalid-argument',
            'Para estornar uma antecipação já Paga, informe obrigatoriamente o protocolo da devolução bancária (protocoloDevolucao).'
          );
        }
        const lncAntSnap = await customDb.ref(`/lancamentos/lnc_ant_${antId}`).get();
        if (lncAntSnap.exists()) {
          const estAntId = `lnc_est_ant_${antId}`;
          const estAnt = gerarEstornoLancamento(
            { id: `lnc_ant_${antId}`, ...lncAntSnap.val() },
            {
              id: estAntId,
              motivo: `${String(motivo).trim()} (Protocolo devolução: ${protoDevolucao})`,
              data: dataContabilBR,
              competencia: competenciaBR,
              usuario: usuarioEmail
            },
            fechamentosMap
          );
          updatesEstorno[`/lancamentos/${estAntId}`] = estAnt;
          lancamentosEstornoIds.push(estAntId);
        }
      }

      const estornoId = `est_ant_${antId}`;
      updatesEstorno[`/estornos/${estornoId}`] = {
        id: estornoId,
        antecipacaoId: antId,
        repasseId: antId,
        produtoraId: ant.produtoraId,
        eventoId: ant.eventoId || null,
        statusAnterior: ant.status,
        valor: ant.valor,
        motivo: String(motivo).trim(),
        protocoloDevolucao: protoDevolucao || null,
        lancamentosEstornoIds,
        estornadoPor: usuarioEmail,
        estornadoEm: agora
      };

      await customDb.ref().update(updatesEstorno);
      await registrarAuditoria(
        {
          usuario: usuarioEmail,
          modulo: 'Antecipacoes',
          eventoId: ant.eventoId || '',
          acao: `Estorno de Antecipação (${ant.status} -> Estornada)`,
          resumo: `Antecipação ${antId} estornada por ${usuarioEmail}. Motivo: ${String(motivo).trim()}.`
        },
        customDb
      );
      await recalcularTodaProdutora(ant.produtoraId, null, customDb);
      return { id: antId, status: 'Estornada', estornoId, lancamentosEstornoIds };
    }

    if (transicao.modoExecucao === 'recusar_solicitada') {
      const updatesRecusa = {
        status: 'Recusada',
        motivoRecusa: String(motivo || 'Recusada pelo Financeiro').trim(),
        decididoPor: usuarioEmail,
        decididoEm: agora,
        _statusAnterior: null,
        _lockOperador: null,
        _lockEm: null,
        _lockEmMs: null
      };
      await customDb.ref(`/antecipacoes/${antId}`).update(updatesRecusa);
      await customDb.ref(`/contas_pagar/cp_ant_${antId}/status`).set('Cancelada');
      await registrarAuditoria(
        {
          usuario: usuarioEmail,
          modulo: 'Antecipacoes',
          eventoId: ant.eventoId || '',
          acao: 'Recusa de Antecipação',
          resumo: `Antecipação ${antId} recusada por ${usuarioEmail}.`
        },
        customDb
      );
      await recalcularTodaProdutora(ant.produtoraId, null, customDb);
      return { id: antId, status: 'Recusada' };
    }

    // Se vem de 'Solicitada', revalida o teto sobre o valor retido do evento no servidor
    if (transicao.modoExecucao === 'aprovar_solicitada' || transicao.modoExecucao === 'aprovar_e_pagar') {
      const [cfgSnap, recalc] = await Promise.all([
        customDb.ref('/config/antecipacao').get(),
        recalcularTodaProdutora(ant.produtoraId, null, customDb)
      ]);
      const cfg = cfgSnap.val() || { pctLimite: 50, taxaPct: 2 };
      const pctLimite = Number(cfg.pctLimite || 50);
      const evCalc = recalc.eventosCalculados.find(e => e.id === ant.eventoId);
      if (!evCalc) {
        throw new HttpsError('failed-precondition', `Evento ${ant.eventoId} não encontrado para a produtora ${ant.produtoraId}.`);
      }

      const outrasAtivasCents = recalc.antecipacoesList
        .filter(a => a.id !== antId && a.eventoId === ant.eventoId && (a.status === 'Aprovada' || a.status === 'Paga'))
        .reduce((acc, a) => acc + toCents(a.valor || 0), 0);

      const tetoRetidoCents = Math.round((toCents(evCalc.retido) * pctLimite) / 100);
      const limiteDisponivelCents = Math.max(0, tetoRetidoCents - outrasAtivasCents);

      if (toCents(ant.valor) > limiteDisponivelCents) {
        throw new HttpsError(
          'failed-precondition',
          `O valor da antecipação (R$ ${Number(ant.valor).toFixed(2)}) excede o limite disponível sobre o retido atual (R$ ${fromCents(limiteDisponivelCents).toFixed(2)}).`
        );
      }
    }

    const statusFinal = transicao.statusDestino; // 'Aprovada' ou 'Paga'
    const updates = {
      [`/antecipacoes/${antId}/status`]: statusFinal,
      [`/antecipacoes/${antId}/decididoPor`]: usuarioEmail,
      [`/antecipacoes/${antId}/decididoEm`]: agora,
      [`/antecipacoes/${antId}/_statusAnterior`]: null,
      [`/antecipacoes/${antId}/_lockOperador`]: null,
      [`/antecipacoes/${antId}/_lockEm`]: null,
      [`/antecipacoes/${antId}/_lockEmMs`]: null,
      [`/contas_pagar/cp_ant_${antId}/status`]: statusFinal === 'Paga' ? 'Paga' : 'Aprovada'
    };

    if (statusFinal === 'Paga') {
      const valorCents = toCents(ant.valor || 0);
      const lancamentoAnt = criarLancamentoPartidaDobrada(
        {
          id: `lnc_ant_${antId}`,
          data: dataContabilBR,
          competencia: competenciaBR,
          produtoraId: ant.produtoraId,
          eventoId: ant.eventoId || null,
          origemModulo: 'Antecipacoes',
          origemId: antId,
          contaDebito: PLANO_CONTAS.ADIANTAMENTOS_ANTECIPACOES_PRODUTOR || PLANO_CONTAS.ADIANTAMENTOS_CONCEDIDOS,
          contaCredito: PLANO_CONTAS.BANCO_CONTA_MOVIMENTO,
          valorCents,
          historico: `Desembolso de antecipação ${antId} (${protocoloBancario || 'PIX/TED'})`,
          usuario: usuarioEmail,
          criadoPor: usuarioEmail,
          criadoEm: agora
        },
        fechamentosMap
      );
      updates[`/antecipacoes/${antId}/pagoPor`] = usuarioEmail;
      updates[`/antecipacoes/${antId}/pagoEm`] = agora;
      updates[`/antecipacoes/${antId}/protocoloBancario`] = String(protocoloBancario || '').trim();
      updates[`/lancamentos/lnc_ant_${antId}`] = lancamentoAnt;
    }

    await customDb.ref().update(updates);
    await registrarAuditoria(
      {
        usuario: usuarioEmail,
        modulo: 'Antecipacoes',
        eventoId: ant.eventoId || '',
        acao: statusFinal === 'Paga' ? 'Pagamento de Antecipação' : 'Aprovação de Antecipação',
        resumo: `Antecipação ${antId} marcada como ${statusFinal} (R$ ${Number(ant.valor || 0).toFixed(2)}) por ${usuarioEmail}.`
      },
      customDb
    );
    await recalcularTodaProdutora(ant.produtoraId, null, customDb);

    return { id: antId, status: statusFinal };
  } catch (err) {
    const snapAtual = await customDb.ref(`/antecipacoes/${antId}/status`).get();
    if (snapAtual.exists() && snapAtual.val() === 'EmProcessamento') {
      await customDb.ref(`/antecipacoes/${antId}`).update({
        status: ant.status,
        _statusAnterior: null,
        _lockOperador: null,
        _lockEm: null,
        _lockEmMs: null
      });
    }
    if (err instanceof HttpsError) {
      throw err;
    }
    throw new HttpsError('failed-precondition', err.message || 'Erro ao decidir antecipação.');
  }
}

exports.solicitarRepasse = onCall((request) => executarSolicitarRepasse(request));
exports.decidirRepasse = onCall((request) => executarDecidirRepasse(request));
exports.estornarRepasse = onCall((request) => executarEstornarRepasse(request));
exports.solicitarAntecipacao = onCall((request) => executarSolicitarAntecipacao(request));
exports.decidirAntecipacao = onCall((request) => executarDecidirAntecipacao(request));

// Exporta funções auxiliares para testes determinísticos da máquina de estados, concorrência, alçada e ledger
exports.validarTransicaoRepasse = validarTransicaoRepasse;
exports.validarTransicaoAntecipacao = validarTransicaoAntecipacao;
exports.executarSolicitarRepasse = executarSolicitarRepasse;
exports.executarDecidirRepasse = executarDecidirRepasse;
exports.executarEstornarRepasse = executarEstornarRepasse;
exports.executarSolicitarAntecipacao = executarSolicitarAntecipacao;
exports.executarDecidirAntecipacao = executarDecidirAntecipacao;
