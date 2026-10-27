'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularFiscal } = require('../domain');
const { validarFiscal, RTDB_NODE } = require('../contract');

test('Módulo financeiro/fiscal — cálculo em centavos e contrato RTDB', () => {
  assert.equal(RTDB_NODE, 'apuracoes_fiscais');
  const calc = calcularFiscal({ id: '1', produtoraId: 'prod_exemplo', valorBase: 100.55, abatimento: 20.05 });
  assert.equal(calc.valorLiquidoCents, 8050);
  assert.equal(calc.valorLiquido, 80.50);

  assert.equal(validarFiscal({ produtoraId: 'prod_exemplo', status: 'Ativo' }).valido, true);
  assert.equal(validarFiscal({}).valido, false);
});
