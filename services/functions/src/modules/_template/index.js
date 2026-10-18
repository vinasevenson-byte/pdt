/**
 * Template de Handler Backend (Cloud Functions) para Módulo Financeiro (_template)
 * Regras:
 * 1. Sempre validar role ('financeiro' ou 'produtor') no início do callable.
 * 2. Toda mutação relevante grava em `/auditoria` via `registrarAuditoria`.
 */

'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { registrarAuditoria } = require('../../shared/recalculo');

exports.executarAcaoTemplate = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Acesso restrito ao perfil Financeiro.');
  }

  const usuarioEmail = auth.token.email || auth.uid;
  const { eventoId = '', resumo = 'Execução de módulo template' } = request.data || {};

  await registrarAuditoria({
    usuario: usuarioEmail,
    modulo: '_template',
    eventoId,
    acao: 'Execução Template',
    resumo
  });

  return { ok: true };
});
