/**
 * Contrato e Validador de Schema — Módulo Operação de Vendas, Lotes e Cortesias (/vendas_lotes)
 */
'use strict';

const RTDB_NODE = 'vendas_lotes';

function validarVendas(payload = {}) {
  const erros = [];
  if (!payload || typeof payload !== 'object') {
    return { valido: false, erros: ['Payload inválido.'] };
  }
  if (!payload.eventoId || typeof payload.eventoId !== 'string') {
    erros.push('eventoId é obrigatório.');
  }
  const vendidos = Number(payload.quantidadeVendida ?? payload.vendidos ?? 0);
  const cortesias = Number(payload.quantidadeCortesias ?? payload.cortesias ?? 0);
  if (!Number.isFinite(vendidos) || vendidos < 0) {
    erros.push('quantidadeVendida deve ser um número >= 0.');
  }
  if (!Number.isFinite(cortesias) || cortesias < 0) {
    erros.push('quantidadeCortesias deve ser um número >= 0.');
  }
  if (vendidos === 0 && cortesias === 0) {
    erros.push('O lote deve informar ao menos 1 ingresso vendido ou 1 cortesia.');
  }
  return {
    valido: erros.length === 0,
    erros
  };
}

module.exports = {
  RTDB_NODE,
  validarVendas
};
