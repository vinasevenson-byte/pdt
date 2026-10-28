/**
 * Contrato e Validador de Schema — Módulo BI Executivo e DRE Gerencial (/bi_executivo)
 */
'use strict';

const RTDB_NODE = 'bi_executivo';

function validarBiExecutivo(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return { valido: false, erros: ['Payload inválido.'] };
  }
  return { valido: true, erros: [] };
}

module.exports = {
  RTDB_NODE,
  validarBiExecutivo
};
