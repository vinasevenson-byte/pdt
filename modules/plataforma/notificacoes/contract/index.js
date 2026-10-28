/**
 * Contrato e Validador de Schema — Módulo Notificações, Alertas e Jobs (/notificacoes_central)
 */
'use strict';

const RTDB_NODE = 'notificacoes_central';

function validarNotificacoes(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return { valido: false, erros: ['Payload inválido.'] };
  }
  return { valido: true, erros: [] };
}

module.exports = {
  RTDB_NODE,
  validarNotificacoes
};
