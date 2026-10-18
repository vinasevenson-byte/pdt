/**
 * Contrato RTDB — Saldos (/saldos/{produtoraId}) e Extrato Limpo do Produtor (/extrato_produtor/{produtoraId})
 */

'use strict';

const RTDB_NODE_SALDOS = 'saldos';
const RTDB_NODE_EXTRATO_PRODUTOR = 'extrato_produtor';

function validarSaldoProdutora(payload = {}) {
  const erros = [];
  if (!payload.produtoraId || typeof payload.produtoraId !== 'string') {
    erros.push('produtoraId obrigatório.');
  }
  for (const campo of ['retidoCents', 'liberavelEventosCents', 'saldoDisponivelCents', 'repassadoCents', 'advancedEmAbertoCents']) {
    if (typeof payload[campo] !== 'number' || !Number.isInteger(payload[campo])) {
      erros.push(`${campo} deve ser inteiro em centavos.`);
    }
  }
  return { valido: erros.length === 0, erros };
}

module.exports = {
  RTDB_NODE_SALDOS,
  RTDB_NODE_EXTRATO_PRODUTOR,
  validarSaldoProdutora
};
