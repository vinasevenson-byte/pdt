/**
 * Contrato e Validador de Schema — Módulo Visualizador de Auditoria e Assinaturas (/auditoria_relatorios)
 */
'use strict';

const RTDB_NODE = 'auditoria_relatorios';

function validarAuditoriaVis(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return { valido: false, erros: ['Payload inválido.'] };
  }
  return { valido: true, erros: [] };
}

module.exports = {
  RTDB_NODE,
  validarAuditoriaVis
};
