/**
 * Contrato e Validador de Schema — Módulo Recebíveis de Gateway e Adquirente (/recebiveis_agenda)
 */
'use strict';

const RTDB_NODE = 'recebiveis_agenda';

function validarRecebiveis(payload = {}) {
  const erros = [];
  if (!payload || typeof payload !== 'object') {
    return { valido: false, erros: ['Payload inválido.'] };
  }
  if (!payload.tituloReceberId || typeof payload.tituloReceberId !== 'string') {
    erros.push('tituloReceberId é obrigatório.');
  }
  return {
    valido: erros.length === 0,
    erros
  };
}

module.exports = {
  RTDB_NODE,
  validarRecebiveis
};
