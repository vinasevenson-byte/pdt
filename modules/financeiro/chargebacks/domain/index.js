/**
 * Domínio Puro (em centavos) — Módulo Chargebacks e Contestações (financeiro/chargebacks)
 */
'use strict';

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function calcularChargebacks(registro = {}) {
  const valorBaseCents = toCents(registro.valorBase || registro.valor || 0);
  const abatimentoCents = toCents(registro.abatimento || 0);
  const liquidoCents = Math.max(0, valorBaseCents - abatimentoCents);

  return {
    id: registro.id || null,
    produtoraId: registro.produtoraId || null,
    eventoId: registro.eventoId || null,
    transacaoAdquirenteId: registro.transacaoAdquirenteId || null,
    valorBaseCents,
    valorBase: fromCents(valorBaseCents),
    abatimentoCents,
    abatimento: fromCents(abatimentoCents),
    valorLiquidoCents: liquidoCents,
    valorLiquido: fromCents(liquidoCents),
    status: registro.status || 'EmDisputa'
  };
}

/**
 * Calcula o impacto consolidado de chargebacks de um evento frente à reserva de reembolso retida.
 */
function calcularImpactoChargebacksEvento({ chargebacks = [], reservaReembolso = 0 } = {}) {
  const lista = Array.isArray(chargebacks) ? chargebacks : Object.values(chargebacks || {});
  const reservaCents = Math.max(0, toCents(reservaReembolso));

  const emDisputaCents = lista
    .filter(c => c && c.status === 'EmDisputa')
    .reduce((acc, c) => acc + Math.max(0, toCents(c.valorLiquido !== undefined ? c.valorLiquido : c.valor || c.valorBase || 0)), 0);

  const confirmadosCents = lista
    .filter(c => c && c.status === 'Confirmado')
    .reduce((acc, c) => acc + Math.max(0, toCents(c.valorLiquido !== undefined ? c.valorLiquido : c.valor || c.valorBase || 0)), 0);

  const revertidosCents = lista
    .filter(c => c && c.status === 'Revertido')
    .reduce((acc, c) => acc + Math.max(0, toCents(c.valorLiquido !== undefined ? c.valorLiquido : c.valor || c.valorBase || 0)), 0);

  const exposicaoTotalCents = emDisputaCents + confirmadosCents;
  const cobertoPelaReservaCents = Math.min(reservaCents, exposicaoTotalCents);
  const excedenteDescobertoCents = Math.max(0, exposicaoTotalCents - reservaCents);

  return {
    reservaReembolsoCents: reservaCents,
    reservaReembolso: fromCents(reservaCents),
    emDisputaCents,
    emDisputa: fromCents(emDisputaCents),
    confirmadosCents,
    confirmados: fromCents(confirmadosCents),
    revertidosCents,
    revertidos: fromCents(revertidosCents),
    exposicaoTotalCents,
    exposicaoTotal: fromCents(exposicaoTotalCents),
    cobertoPelaReservaCents,
    cobertoPelaReserva: fromCents(cobertoPelaReservaCents),
    excedenteDescobertoCents,
    excedenteDescoberto: fromCents(excedenteDescobertoCents)
  };
}

module.exports = {
  calcularChargebacks,
  calcularImpactoChargebacksEvento
};
