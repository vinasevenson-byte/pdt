/**
 * Contrato e Validador de Schema — Módulo Cobrança, Inadimplência e Devedores (/cobrancas_devedores)
 */
'use strict';

const RTDB_NODE = 'cobrancas_devedores';

function validarCobranca(payload = {}) {
  const erros = [];
  if (!payload || typeof payload !== 'object') {
    return { valido: false, erros: ['Payload inválido.'] };
  }
  if (!payload.produtoraId || typeof payload.produtoraId !== 'string') {
    erros.push('produtoraId é obrigatório.');
  }
  return {
    valido: erros.length === 0,
    erros
  };
}

module.exports = {
  RTDB_NODE,
  validarCobranca
};
