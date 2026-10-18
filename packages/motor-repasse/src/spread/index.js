/**
 * Motor de Spread do Disk — packages/motor-repasse/src/spread
 * Calcula a margem líquida (spread) do Disk por operação (ex.: antecipação, gateway/adquirente),
 * por evento e consolidada por produtora. Exclusivo do Financeiro.
 */

'use strict';

const { toCents, fromCents, mulPct } = require('../shared/money');

function calcSpreadOperacao({
  valorBase = 0,
  taxaCobradaPct = 0,
  taxaCobradaFixa = 0,
  custoCaptacaoPct = 0,
  custoAdquirenteFixo = 0
}) {
  const base = fromCents(toCents(valorBase));
  const receitaCents = toCents(mulPct(base, taxaCobradaPct)) + toCents(taxaCobradaFixa);
  const custoCents = toCents(mulPct(base, custoCaptacaoPct)) + toCents(custoAdquirenteFixo);
  const spreadLiquidoCents = receitaCents - custoCents;
  const spreadPctEfetivo = toCents(valorBase) > 0
    ? Math.round((spreadLiquidoCents / toCents(valorBase)) * 10000) / 100
    : 0;

  return {
    valorBaseCents: toCents(valorBase),
    valorBase: base,
    receitaCobradaCents: receitaCents,
    receitaCobrada: fromCents(receitaCents),
    custoTotalCents: custoCents,
    custoTotal: fromCents(custoCents),
    spreadLiquidoCents,
    spreadLiquido: fromCents(spreadLiquidoCents),
    spreadPctEfetivo
  };
}

function calcSpreadAntecipacoes(antecipacoes = [], custoCaptacaoPctPadrao = 0.8) {
  const lista = Array.isArray(antecipacoes) ? antecipacoes : Object.values(antecipacoes || {});
  const aprovadas = lista.filter(a => a && (a.status === 'Aprovada' || a.status === 'Paga'));

  const operacoes = aprovadas.map(a => {
    const op = calcSpreadOperacao({
      valorBase: a.valor,
      taxaCobradaPct: a.taxaPct !== undefined ? a.taxaPct : 2,
      custoCaptacaoPct: a.custoCaptacaoPct !== undefined ? a.custoCaptacaoPct : custoCaptacaoPctPadrao
    });
    return {
      antecipacaoId: a.id || null,
      eventoId: a.eventoId || null,
      produtoraId: a.produtoraId || null,
      ...op
    };
  });

  const receitaTotalCents = operacoes.reduce((acc, o) => acc + o.receitaCobradaCents, 0);
  const custoTotalCents = operacoes.reduce((acc, o) => acc + o.custoTotalCents, 0);
  const spreadTotalCents = receitaTotalCents - custoTotalCents;

  return {
    operacoes,
    receitaTotal: fromCents(receitaTotalCents),
    custoTotal: fromCents(custoTotalCents),
    spreadTotalCents,
    spreadTotal: fromCents(spreadTotalCents)
  };
}

module.exports = {
  calcSpreadOperacao,
  calcSpreadAntecipacoes
};
