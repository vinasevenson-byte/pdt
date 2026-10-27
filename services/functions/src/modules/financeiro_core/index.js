/**
 * Callables dos Módulos Financeiros do Núcleo (Seção 5 & Fase 2 — Fechamento Mensal):
 * - registrarBaixaTitulo (/contas_pagar ou /contas_receber -> /lancamentos + /fluxo_caixa + /auditoria)
 * - estornarLancamento (/lancamentos imutável -> novo lançamento inverso + /auditoria)
 * - previaFechamento (somente leitura: bloqueios, avisos, balancete por conta e verificação de selo SHA-256)
 * - fecharCompetencia (pré-checa, trava, recalcula, sela com SHA-256 e grava em sequência)
 * - reabrirCompetencia (reabre somente a última competência fechada, com motivo, segregação de funções e histórico permanente)
 */

'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  obterDataAtualBR,
  obterCompetenciaAtualBR,
  registrarAuditoria,
  somarDiasUteis,
  calcFluxoCaixa,
  baixarTitulo,
  gerarEstornoLancamento,
  validarFormatoCompetencia,
  calcularPreviaFechamento,
  verificarPermissaoReabertura,
  temPermissao,
  publicarEventoDominio
} = require('../../shared/recalculo');

const { onCall, HttpsError } = httpsV2;

const LOCK_FECHAMENTO_TTL_MS = 5 * 60 * 1000;

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

async function carregarDadosParaFechamento(customDb, competencia) {
  const refLanc = customDb.ref('/lancamentos');
  const queryCompetenciaPromise =
    typeof refLanc.orderByChild === 'function'
      ? refLanc.orderByChild('competencia').equalTo(competencia).get()
      : refLanc.get();

  const [lancCompSnap, todosLancSnap, repSnap, estSnap, fechSnap] = await Promise.all([
    queryCompetenciaPromise,
    refLanc.get(),
    customDb.ref('/repasses').get(),
    customDb.ref('/estornos').get(),
    customDb.ref('/fechamentos').get()
  ]);

  const todosLanc = (todosLancSnap && todosLancSnap.val()) || {};
  const lancComp = (lancCompSnap && lancCompSnap.val()) || {};
  const lancamentos = { ...todosLanc, ...lancComp };

  return {
    lancamentos,
    repasses: (repSnap && repSnap.val()) || {},
    estornos: (estSnap && estSnap.val()) || {},
    fechamentos: (fechSnap && fechSnap.val()) || {}
  };
}

async function executarRegistrarBaixaTitulo(request, deps = {}) {
  const db = deps.db || defaultDb;
  const auth = request.auth;
  if (!auth || !temPermissao(auth.token, 'titulo:baixar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "titulo:baixar" (Financeiro, Aprovador ou Operador) podem baixar títulos.'
    );
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

    await registrarAuditoria(
      {
        usuario,
        modulo: colecao,
        eventoId: tituloAtualizado.eventoId || '',
        acao: `Baixa de Título (${tituloAtualizado.status})`,
        resumo: `Título ${tituloId} baixado por R$ ${Number(tituloAtualizado.valorBaixado).toFixed(2)}. Lançamento ledger: ${novoLancRef.key}.`
      },
      db
    );

    return { titulo: tituloAtualizado, lancamento };
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message);
  }
}

async function executarEstornarLancamento(request, deps = {}) {
  const db = deps.db || defaultDb;
  const auth = request.auth;
  if (!auth || !temPermissao(auth.token, 'ledger:estornar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "ledger:estornar" (Financeiro ou Aprovador) podem estornar lançamentos no Ledger.'
    );
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
    await registrarAuditoria(
      {
        usuario,
        modulo: 'Ledger',
        eventoId: estorno.eventoId || '',
        acao: 'Estorno Contábil',
        resumo: `Estorno ${estornoRef.key} gerado para lançamento original ${lancamentoId}: ${motivo}`
      },
      db
    );

    return estorno;
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message);
  }
}

/**
 * 1. previaFechamento — Somente leitura.
 * Retorna bloqueios, avisos, balancete por conta e verificação do selo SHA-256 caso o mês já esteja fechado.
 */
async function executarPreviaFechamento(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (
    !auth ||
    (!temPermissao(auth.token, 'competencia:previa') && !temPermissao(auth.token, 'competencia:fechar'))
  ) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis autorizados (Financeiro, Aprovador, Fiscal ou Auditor) podem consultar a prévia de fechamento.'
    );
  }

  const { competencia } = request.data || {};
  if (!validarFormatoCompetencia(competencia)) {
    throw new HttpsError('invalid-argument', 'Informe a competência no formato válido YYYY-MM (01 a 12).');
  }

  const competenciaAtual = deps.competenciaAtual || obterCompetenciaAtualBR(nowDate);
  const dados = await carregarDadosParaFechamento(db, competencia);

  return calcularPreviaFechamento({
    competencia,
    lancamentos: dados.lancamentos,
    repasses: dados.repasses,
    estornos: dados.estornos,
    fechamentos: dados.fechamentos,
    competenciaAtual
  });
}

/**
 * 2. fecharCompetencia — Fecha mês já encerrado e em sequência.
 * Pré-checa -> Trava transacional -> Recalcula sob trava -> Sela com SHA-256 -> Grava.
 */
async function executarFecharCompetencia(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const nowMs = nowDate instanceof Date ? nowDate.getTime() : Date.now();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'competencia:fechar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "competencia:fechar" (Financeiro, Aprovador ou Fiscal) podem fechar competências.'
    );
  }

  const { competencia, observacoes = '' } = request.data || {};
  if (!validarFormatoCompetencia(competencia)) {
    throw new HttpsError('invalid-argument', 'Informe a competência no formato válido YYYY-MM (01 a 12).');
  }

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const competenciaAtual = deps.competenciaAtual || obterCompetenciaAtualBR(nowDate);

  // Passo 1: Pré-checagem antes de adquirir trava
  const dadosIniciais = await carregarDadosParaFechamento(db, competencia);
  const fechExistente = dadosIniciais.fechamentos[competencia];
  if (fechExistente && fechExistente.fechado === true) {
    throw new HttpsError('failed-precondition', `A competência ${competencia} já se encontra encerrada.`);
  }

  const previaInicial = calcularPreviaFechamento({
    competencia,
    lancamentos: dadosIniciais.lancamentos,
    repasses: dadosIniciais.repasses,
    estornos: dadosIniciais.estornos,
    fechamentos: dadosIniciais.fechamentos,
    competenciaAtual
  });

  if (previaInicial.bloqueios.length > 0) {
    throw new HttpsError(
      'failed-precondition',
      `Fechamento bloqueado para ${competencia}: ${previaInicial.bloqueios.map(b => b.mensagem).join(' | ')}`,
      { bloqueios: previaInicial.bloqueios }
    );
  }

  // Passo 2: Adquire trava transacional em /fechamentos/{competencia}
  const fechRef = db.ref(`/fechamentos/${competencia}`);
  let estadoAnterior = null;
  let motivoAbort = null;

  if (typeof fechRef.transaction === 'function') {
    const txRes = await fechRef.transaction(current => {
      if (current && current.fechado === true) {
        motivoAbort = `A competência ${competencia} já se encontra encerrada.`;
        return;
      }
      const travaAtiva =
        current &&
        (current.emFechamento === true || current.status === 'Fechando') &&
        (!current._lockEmMs || nowMs - Number(current._lockEmMs) <= LOCK_FECHAMENTO_TTL_MS);

      if (travaAtiva) {
        motivoAbort = `A competência ${competencia} já está sendo fechada por outro operador (${current._lockPor || 'em andamento'}).`;
        return;
      }

      estadoAnterior = current ? structuredClone(current) : null;
      return {
        ...(current || {}),
        competencia,
        fechado: false,
        emFechamento: true,
        status: 'Fechando',
        _lockPor: usuario,
        _lockPorUid: auth.uid,
        _lockEm: agora,
        _lockEmMs: nowMs
      };
    });

    if (motivoAbort || !txRes.committed) {
      throw new HttpsError(
        'failed-precondition',
        motivoAbort || `Conflito de concorrência ao iniciar o fechamento da competência ${competencia}.`
      );
    }
  } else {
    estadoAnterior = fechExistente ? structuredClone(fechExistente) : null;
    await fechRef.set({
      ...(estadoAnterior || {}),
      competencia,
      fechado: false,
      emFechamento: true,
      status: 'Fechando',
      _lockPor: usuario,
      _lockPorUid: auth.uid,
      _lockEm: agora,
      _lockEmMs: nowMs
    });
  }

  try {
    // Hook opcional para testes de concorrência verificarem que a trava bloqueia lançamentos durante o cálculo
    if (typeof deps.onAfterLock === 'function') {
      await deps.onAfterLock();
    }

    // Passo 3: Recalcula balancete e validações sob a trava
    const dadosSobTrava = await carregarDadosParaFechamento(db, competencia);
    const previaSobTrava = calcularPreviaFechamento({
      competencia,
      lancamentos: dadosSobTrava.lancamentos,
      repasses: dadosSobTrava.repasses,
      estornos: dadosSobTrava.estornos,
      fechamentos: dadosSobTrava.fechamentos,
      competenciaAtual,
      ignorarTravaPropria: true
    });

    if (previaSobTrava.bloqueios.length > 0) {
      throw new HttpsError(
        'failed-precondition',
        `Fechamento abortado após recálculo sob trava (${competencia}): ${previaSobTrava.bloqueios.map(b => b.mensagem).join(' | ')}`,
        { bloqueios: previaSobTrava.bloqueios }
      );
    }

    // Passo 4: Sela com SHA-256 e grava o fechamento versionado
    const versaoAnterior = (estadoAnterior && Number(estadoAnterior.versao)) || 0;
    const novaVersao = versaoAnterior + 1;
    const seloAnterior =
      (estadoAnterior && (estadoAnterior.ultimoSeloSha256 || estadoAnterior.seloSha256)) || null;
    const historicoReaberturas =
      estadoAnterior && Array.isArray(estadoAnterior.historicoReaberturas)
        ? estadoAnterior.historicoReaberturas
        : [];

    const payloadFechado = {
      competencia,
      fechado: true,
      emFechamento: false,
      status: 'Fechado',
      versao: novaVersao,
      seloSha256: previaSobTrava.seloCalculado,
      seloAnterior,
      fechadoPor: usuario,
      fechadoPorUid: auth.uid,
      fechadoEm: agora,
      observacoes: String(observacoes || ''),
      resumoBalancete: {
        quantidadeLancamentos: previaSobTrava.balancete.quantidadeLancamentos,
        totalDebitosCents: previaSobTrava.balancete.totalDebitosCents,
        totalCreditosCents: previaSobTrava.balancete.totalCreditosCents,
        totalDebitos: previaSobTrava.balancete.totalDebitos,
        totalCreditos: previaSobTrava.balancete.totalCreditos,
        contas: previaSobTrava.balancete.contas
      },
      historicoReaberturas
    };

    await fechRef.set(payloadFechado);

    await registrarAuditoria(
      {
        usuario,
        modulo: 'Fechamentos',
        eventoId: competencia,
        acao: `Fechamento de Competência (v${novaVersao})`,
        resumo: `Competência ${competencia} encerrada por ${usuario} (v${novaVersao}, selo SHA-256: ${payloadFechado.seloSha256.slice(0, 16)}…, ${payloadFechado.resumoBalancete.quantidadeLancamentos} lançamento(s)).`
      },
      db
    );

    await publicarEventoDominio(db, {
      tipo: 'CompetenciaFechada',
      origemModulo: 'Fechamentos',
      referenciaId: competencia,
      payload: {
        competencia,
        versao: novaVersao,
        seloSha256: payloadFechado.seloSha256,
        fechadoPor: usuario
      }
    });

    return payloadFechado;
  } catch (err) {
    // Libera a trava restaurando o estado anterior caso o recálculo ou gravação falhe
    await fechRef.set(estadoAnterior);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('failed-precondition', err.message || 'Erro ao fechar competência.');
  }
}

/**
 * 3. reabrirCompetencia — Reabre exclusivamente a última competência fechada,
 * exigindo motivo, segregação de funções (outro operador que não o que fechou) e mantendo histórico permanente.
 */
async function executarReabrirCompetencia(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (
    !auth ||
    (!temPermissao(auth.token, 'competencia:reabrir') && !temPermissao(auth.token, 'competencia:fechar'))
  ) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "competencia:reabrir" (Financeiro, Aprovador ou Fiscal) podem reabrir competências.'
    );
  }

  const { competencia, motivo = '' } = request.data || {};
  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);

  const fechSnap = await db.ref('/fechamentos').get();
  const fechamentos = (fechSnap && fechSnap.val()) || {};

  const segregacaoAtiva =
    deps.fechamentoSegregacao !== undefined
      ? Boolean(deps.fechamentoSegregacao)
      : !(process.env.FECHAMENTO_SEGREGACAO === 'false' && process.env.NODE_ENV !== 'production');

  const check = verificarPermissaoReabertura(competencia, {
    fechamentos,
    motivo,
    usuario,
    uid: auth.uid,
    segregacaoAtiva
  });

  if (!check.permitido) {
    throw new HttpsError(check.codigoErro, check.mensagem);
  }

  const fechAtual = fechamentos[competencia];
  const motivoLimpo = String(motivo).trim();
  const historicoAnterior = Array.isArray(fechAtual.historicoReaberturas)
    ? [...fechAtual.historicoReaberturas]
    : [];

  const registroReabertura = {
    versaoFechada: Number(fechAtual.versao || 1),
    seloSha256: fechAtual.seloSha256 || null,
    fechadoPor: fechAtual.fechadoPor || null,
    fechadoPorUid: fechAtual.fechadoPorUid || null,
    fechadoEm: fechAtual.fechadoEm || null,
    reabertoPor: usuario,
    reabertoPorUid: auth.uid,
    reabertoEm: agora,
    motivo: motivoLimpo
  };

  const payloadReaberto = {
    ...fechAtual,
    competencia,
    fechado: false,
    emFechamento: false,
    status: 'Reaberto',
    ultimoSeloSha256: fechAtual.seloSha256 || fechAtual.ultimoSeloSha256 || null,
    reabertoPor: usuario,
    reabertoPorUid: auth.uid,
    reabertoEm: agora,
    motivoReabertura: motivoLimpo,
    historicoReaberturas: [...historicoAnterior, registroReabertura]
  };

  await db.ref(`/fechamentos/${competencia}`).set(payloadReaberto);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'Fechamentos',
      eventoId: competencia,
      acao: 'Reabertura de Competência',
      resumo: `Competência ${competencia} (v${fechAtual.versao || 1}) reaberta por ${usuario}. Motivo: ${motivoLimpo}`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: 'CompetenciaReaberta',
    origemModulo: 'Fechamentos',
    referenciaId: competencia,
    payload: {
      competencia,
      versaoAnterior: Number(fechAtual.versao || 1),
      reabertoPor: usuario,
      motivo: motivoLimpo
    }
  });

  return payloadReaberto;
}

exports.registrarBaixaTitulo = onCall(request => executarRegistrarBaixaTitulo(request));
exports.estornarLancamento = onCall(request => executarEstornarLancamento(request));
exports.previaFechamento = onCall(request => executarPreviaFechamento(request));
exports.fecharCompetencia = onCall(request => executarFecharCompetencia(request));
exports.reabrirCompetencia = onCall(request => executarReabrirCompetencia(request));

exports.executarRegistrarBaixaTitulo = executarRegistrarBaixaTitulo;
exports.executarEstornarLancamento = executarEstornarLancamento;
exports.executarPreviaFechamento = executarPreviaFechamento;
exports.executarFecharCompetencia = executarFecharCompetencia;
exports.executarReabrirCompetencia = executarReabrirCompetencia;
