'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularContratos } = require('../domain');
const { validarContratos, RTDB_NODE } = require('../contract');

test('Módulo comercial/contratos — cálculo em centavos e contrato RTDB', () => {
  assert.equal(RTDB_NODE, 'contratos');
  const calc = calcularContratos({ id: '1', produtoraId: 'prod_exemplo', valorBase: 100.55, abatimento: 20.05 });
  assert.equal(calc.valorLiquidoCents, 8050);
  assert.equal(calc.valorLiquido, 80.50);

  assert.equal(validarContratos({ produtoraId: 'prod_exemplo', status: 'Ativo' }).valido, true);
  assert.equal(validarContratos({}).valido, false);
});
