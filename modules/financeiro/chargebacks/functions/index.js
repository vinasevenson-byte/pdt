/**
 * Cloud Function Handler — Módulo Chargebacks (financeiro/chargebacks)
 */
'use strict';

const { httpsV2, registrarAuditoria } = require('../../../../services/functions/src/shared/recalculo');
const { validarChargebacks } = require('../contract');
const { onCall, HttpsError } = httpsV2;

exports.processar_financeiro_chargebacks = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Acesso restrito ao perfil Financeiro.');
  }

  const validacao = validarChargebacks(request.data || {});
  if (!validacao.valido) {
    throw new HttpsError('invalid-argument', validacao.erros.join(' '));
  }

  await registrarAuditoria({
    usuario: auth.token.email || auth.uid,
    modulo: 'financeiro/chargebacks',
    eventoId: request.data.eventoId || '',
    acao: 'Processar Chargebacks',
    resumo: `Processamento no nó /chargebacks`
  });

  return { ok: true, id: 'financeiro/chargebacks', no: 'chargebacks' };
});
