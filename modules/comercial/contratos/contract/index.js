/**
 * Contrato e Validador de Schema — Módulo Contratos (/contratos)
 */
'use strict';

const RTDB_NODE = 'contratos';

function validarContratos(payload = {}) {
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
  validarContratos
};
