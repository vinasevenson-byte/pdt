/**
 * Contrato RTDB — Contas a Receber (/contas_receber)
 */

'use strict';

const RTDB_NODE = 'contas_receber';
const STATUS_TITULO_RECEBER = ['Prevista', 'Aprovada', 'Recebida', 'Cancelada', 'Vencida'];

function validarContaReceber(payload = {}) {
  const erros = [];
  if (!payload.categoria || typeof payload.categoria !== 'string') erros.push('categoria obrigatória.');
  if (!payload.vencimento || typeof payload.vencimento !== 'string') erros.push('vencimento obrigatório.');
  if (typeof payload.valorCents !== 'number' || !Number.isInteger(payload.valorCents) || payload.valorCents <= 0) {
    erros.push('valorCents deve ser um inteiro positivo em centavos.');
  }
  if (payload.status && !STATUS_TITULO_RECEBER.includes(payload.status)) {
    erros.push(`status inválido (${payload.status}).`);
  }
  return { valido: erros.length === 0, erros };
}

module.exports = {
  RTDB_NODE,
  STATUS_TITULO_RECEBER,
  validarContaReceber
};
