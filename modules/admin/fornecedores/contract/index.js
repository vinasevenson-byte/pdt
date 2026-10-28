/**
 * Contrato e Validador de Schema — Módulo Fornecedores e Compras Operacionais (/fornecedores_op)
 */
'use strict';

const RTDB_NODE = 'fornecedores_op';

function validarFornecedores(payload = {}) {
  const erros = [];
  if (!payload || typeof payload !== 'object') {
    return { valido: false, erros: ['Payload inválido.'] };
  }
  if (!payload.eventoId || typeof payload.eventoId !== 'string') {
    erros.push('eventoId é obrigatório.');
  }
  if (!payload.descricao || typeof payload.descricao !== 'string') {
    erros.push('descricao é obrigatória.');
  }
  return {
    valido: erros.length === 0,
    erros
  };
}

module.exports = {
  RTDB_NODE,
  validarFornecedores
};
