/**
 * Cloud Function Handler — Módulo Notificações, Alertas e Jobs (plataforma/notificacoes)
 * - `processarFilaNotificacoesOutbox`: consome eventos pendentes de `/eventos_dominio`, grava alertas limpos
 *   em `/notificacoes_central/{notifId}` e marca os eventos do outbox como `Processado`.
 */
'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  registrarAuditoria,
  temPermissao
} = require('../../../../services/functions/src/shared/recalculo');
const { gerarNotificacoesDeOutbox } = require('../domain');
const { onCall, HttpsError } = httpsV2;

async function executarProcessarFilaNotificacoesOutbox(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'notificacoes:gerenciar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "notificacoes:gerenciar" podem processar a fila de notificações e jobs.'
    );
  }

  const domSnap = await db.ref('/eventos_dominio').get();
  const dataHora = formatarDataHoraBR(nowDate);
  const usuario = auth.token.email || auth.uid;

  const resultado = gerarNotificacoesDeOutbox(domSnap.val() || {}, dataHora);
  const updates = {};

  for (const idDom of resultado.eventosProcessadosIds) {
    updates[`/eventos_dominio/${idDom}/status`] = 'Processado';
    updates[`/eventos_dominio/${idDom}/processadoEm`] = dataHora;
  }

  for (const ntf of resultado.notificacoesGeradas) {
    updates[`/notificacoes_central/${ntf.id}`] = ntf;
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }

  await registrarAuditoria(
    {
      usuario,
      modulo: 'plataforma/notificacoes',
      eventoId: '',
      acao: 'Processamento de Outbox de Notificações',
      resumo: `Outbox processado: ${resultado.quantidadeEventosProcessados} evento(s) de domínio consumido(s), ${resultado.quantidadeNotificacoesGeradas} notificação(ões) despachada(s).`
    },
    db
  );

  return resultado;
}

exports.processarFilaNotificacoesOutbox = onCall(request => executarProcessarFilaNotificacoesOutbox(request));
exports.executarProcessarFilaNotificacoesOutbox = executarProcessarFilaNotificacoesOutbox;
exports.processar_plataforma_notificacoes = onCall(request => executarProcessarFilaNotificacoesOutbox(request));
