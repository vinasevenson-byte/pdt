/**
 * Contrato RTDB — Ledger (/lancamentos) e Fechamentos (/fechamentos)
 */

'use strict';

const RTDB_NODE_LANCAMENTOS = 'lancamentos';
const RTDB_NODE_FECHAMENTOS = 'fechamentos';

function validarLancamento(payload = {}) {
  const erros = [];
  if (!payload.data || typeof payload.data !== 'string') erros.push('data obrigatória.');
  if (!payload.competencia || !/^\d{4}-\d{2}$/.test(payload.competencia)) erros.push('competencia (YYYY-MM) obrigatória.');
  if (!payload.contaDebito || typeof payload.contaDebito !== 'string') erros.push('contaDebito obrigatória.');
  if (!payload.contaCredito || typeof payload.contaCredito !== 'string') erros.push('contaCredito obrigatória.');
  if (payload.contaDebito && payload.contaDebito === payload.contaCredito) {
    erros.push('contaDebito e contaCredito devem ser distintas.');
  }
  if (typeof payload.valorCents !== 'number' || !Number.isInteger(payload.valorCents) || payload.valorCents <= 0) {
    erros.push('valorCents deve ser um inteiro positivo em centavos.');
  }
  return { valido: erros.length === 0, erros };
}

module.exports = {
  RTDB_NODE_LANCAMENTOS,
  RTDB_NODE_FECHAMENTOS,
  validarLancamento
};
