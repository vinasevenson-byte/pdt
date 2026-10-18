/**
 * Template de Contrato RTDB — Módulo Financeiro (_template)
 * Define o nó no Realtime Database e a função de validação de schema.
 */

'use strict';

const RTDB_NODE = '_template';

function validarRegistroTemplate(payload = {}) {
  const erros = [];
  if (!payload.produtoraId || typeof payload.produtoraId !== 'string') {
    erros.push('produtoraId é obrigatório.');
  }
  if (typeof payload.valorBase !== 'number' || payload.valorBase < 0) {
    erros.push('valorBase deve ser um número não negativo.');
  }
  return {
    valido: erros.length === 0,
    erros
  };
}

module.exports = {
  RTDB_NODE,
  validarRegistroTemplate
};
