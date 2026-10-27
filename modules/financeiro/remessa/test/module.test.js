'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularRemessa } = require('../domain');
const { validarRemessa, RTDB_NODE } = require('../contract');

test('Módulo financeiro/remessa — cálculo em centavos e contrato RTDB', () => {
  assert.equal(RTDB_NODE, 'remessas');
  const calc = calcularRemessa({ id: '1', produtoraId: 'prod_exemplo', valorBase: 100.55, abatimento: 20.05 });
  assert.equal(calc.valorLiquidoCents, 8050);
  assert.equal(calc.valorLiquido, 80.50);

  assert.equal(validarRemessa({ produtoraId: 'prod_exemplo', status: 'Ativo' }).valido, true);
  assert.equal(validarRemessa({}).valido, false);
});
