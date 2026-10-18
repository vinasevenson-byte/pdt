/**
 * Contrato RTDB — Fluxo de Caixa (/fluxo_caixa)
 */

'use strict';

const RTDB_NODE = 'fluxo_caixa';

function validarFluxoCaixaSnapshot(payload = {}) {
  const erros = [];
  if (!payload.dataReferencia || typeof payload.dataReferencia !== 'string') {
    erros.push('dataReferencia obrigatória.');
  }
  if (!Array.isArray(payload.serieDiaria)) {
    erros.push('serieDiaria deve ser um array.');
  }
  if (!payload.janelas || !payload.janelas.d30 || !payload.janelas.d60 || !payload.janelas.d90) {
    erros.push('janelas d30, d60 e d90 são obrigatórias.');
  }
  return { valido: erros.length === 0, erros };
}

module.exports = {
  RTDB_NODE,
  validarFluxoCaixaSnapshot
};
