/**
 * Contrato e Validador de Schema — Módulo Chargebacks (/chargebacks)
 */
'use strict';

const RTDB_NODE = 'chargebacks';

function validarChargebacks(payload = {}) {
  const erros = [];
  if (!payload || typeof payload !== 'object') {
    return { valido: false, erros: ['Payload inválido.'] };
  }
  if (!payload.produtoraId || typeof payload.produtoraId !== 'string') {
    erros.push('produtoraId é obrigatório.');
  }
  if (!payload.status || typeof payload.status !== 'string') {
    erros.push('status é obrigatório.');
  }
  return {
    valido: erros.length === 0,
    erros
  };
}

module.exports = {
  RTDB_NODE,
  validarChargebacks
};
