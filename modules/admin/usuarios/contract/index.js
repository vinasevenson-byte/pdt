/**
 * Contrato e Validador de Schema — Módulo Usuários, Papéis (RBAC) e Alçadas (/usuarios_erp)
 */
'use strict';

const RTDB_NODE = 'usuarios_erp';

const PAPEIS_VALIDOS = new Set([
  'financeiro',
  'aprovador',
  'operador',
  'fiscal',
  'comercial',
  'auditor',
  'produtor'
]);

function validarUsuarios(payload = {}) {
  const erros = [];
  if (!payload || typeof payload !== 'object') {
    return { valido: false, erros: ['Payload inválido.'] };
  }
  if (!payload.uid || typeof payload.uid !== 'string') {
    erros.push('uid é obrigatório.');
  }
  if (!payload.email || typeof payload.email !== 'string' || !payload.email.includes('@')) {
    erros.push('email válido é obrigatório.');
  }
  if (!payload.papel || !PAPEIS_VALIDOS.has(payload.papel)) {
    erros.push('papel deve ser um dos perfis oficiais do ERP.');
  }
  return {
    valido: erros.length === 0,
    erros
  };
}

module.exports = {
  RTDB_NODE,
  PAPEIS_VALIDOS,
  validarUsuarios
};
