/**
 * Motor de Advanced (Adiantamentos Contratuais) — packages/motor-repasse/src/advanced
 * Entradas: adiantamentos concedidos, repasses com abatimento, devoluções diretas.
 * Saída: saldo de advanced em aberto e valor a abater no próximo repasse.
 */

'use strict';

const { toCents, fromCents } = require('../shared/money');

function calcAdvancedPosicao(adiantamentos = [], devolucoes = [], escopoFiltro = null) {
  const listaAdv = Array.isArray(adiantamentos) ? adiantamentos : Object.values(adiantamentos || {});
  const listaDev = Array.isArray(devolucoes) ? devolucoes : Object.values(devolucoes || {});

  const filtrados = escopoFiltro
    ? listaAdv.filter(a => a && a.escopo === escopoFiltro)
    : listaAdv.filter(Boolean);

  const totalConcedidoCents = filtrados.reduce((acc, a) => acc + toCents(a.valor), 0);

  // Adiantamentos já abatidos em repasses anteriores (abaterNoProximo === false e status !== 'Devolvido')
  const totalAbatidoEmRepassesCents = filtrados
    .filter(a => a.abaterNoProximo === false && a.status !== 'Devolvido')
    .reduce((acc, a) => acc + toCents(a.valorAbatido !== undefined ? a.valorAbatido : a.valor), 0);

  // Devoluções financeiras diretas de advanced
  const totalDevolvidoCents = listaDev
    .filter(d => !escopoFiltro || d.escopo === escopoFiltro)
    .reduce((acc, d) => acc + toCents(d.valor), 0);

  // Saldo em aberto pendente de compensação no próximo repasse
  const abaterNoProximoCents = filtrados
    .filter(a => a.abaterNoProximo === true && a.status !== 'Devolvido')
    .reduce((acc, a) => acc + toCents(a.valor), 0);

  const saldoAbertoCents = Math.max(0, totalConcedidoCents - totalAbatidoEmRepassesCents - totalDevolvidoCents);

  return {
    totalConcedidoCents,
    totalConcedido: fromCents(totalConcedidoCents),
    totalAbatidoEmRepassesCents,
    totalAbatidoEmRepasses: fromCents(totalAbatidoEmRepassesCents),
    totalDevolvidoCents,
    totalDevolvido: fromCents(totalDevolvidoCents),
    abaterNoProximoCents,
    abaterNoProximo: fromCents(abaterNoProximoCents),
    saldoAbertoCents,
    saldoAberto: fromCents(saldoAbertoCents)
  };
}

module.exports = {
  calcAdvancedPosicao
};
