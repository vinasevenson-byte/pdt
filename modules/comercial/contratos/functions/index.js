/**
 * Cloud Function Handler — Módulo Contratos (comercial/contratos)
 */
'use strict';

const { httpsV2, registrarAuditoria } = require('../../../../services/functions/src/shared/recalculo');
const { validarContratos } = require('../contract');
const { onCall, HttpsError } = httpsV2;

exports.processar_comercial_contratos = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Acesso restrito ao perfil Financeiro.');
  }

  const validacao = validarContratos(request.data || {});
  if (!validacao.valido) {
    throw new HttpsError('invalid-argument', validacao.erros.join(' '));
  }

  await registrarAuditoria({
    usuario: auth.token.email || auth.uid,
    modulo: 'comercial/contratos',
    eventoId: request.data.eventoId || '',
    acao: 'Processar Contratos',
    resumo: `Processamento no nó /contratos`
  });

  return { ok: true, id: 'comercial/contratos', no: 'contratos' };
});
