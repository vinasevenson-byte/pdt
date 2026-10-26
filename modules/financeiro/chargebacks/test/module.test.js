'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularChargebacks } = require('../domain');
const { validarChargebacks, RTDB_NODE } = require('../contract');

test('Módulo financeiro/chargebacks — cálculo em centavos e contrato RTDB', () => {
  assert.equal(RTDB_NODE, 'chargebacks');
  const calc = calcularChargebacks({ id: '1', produtoraId: 'prod_exemplo', valorBase: 100.55, abatimento: 20.05 });
  assert.equal(calc.valorLiquidoCents, 8050);
  assert.equal(calc.valorLiquido, 80.50);

  assert.equal(validarChargebacks({ produtoraId: 'prod_exemplo', status: 'Ativo' }).valido, true);
  assert.equal(validarChargebacks({}).valido, false);
});
