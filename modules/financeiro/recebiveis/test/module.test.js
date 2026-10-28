import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { calcularLiquidacaoAdquirente } = require('../domain/index.js');

test('financeiro/recebiveis — cálculo de MDR e valor líquido em centavos', () => {
  const calc = calcularLiquidacaoAdquirente(
    { taxaMdrPct: 3.0, taxaAntecipacaoPct: 1.5, dataVendaBR: '05/10/2026', prazoDiasUteis: 2 },
    { valor: 10000 }
  );
  assert.equal(calc.valorBrutoCents, 1000000);
  assert.equal(calc.descontoMdrCents, 30000);
  assert.equal(calc.descontoAntecipacaoCents, 15000);
  assert.equal(calc.valorLiquidoCents, 955000);
  assert.equal(calc.dataPrevistaLiquidacao, '07/10/2026');
});
