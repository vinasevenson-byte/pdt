import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { apurarPosicaoDevedoraProdutora } = require('../domain/index.js');

test('financeiro/cobranca — compensação automática entre eventos e cálculo de dívida residual', () => {
  const res = apurarPosicaoDevedoraProdutora({
    produtoraId: 'prod_exemplo',
    eventosCalculados: [
      { id: 'ev1', nome: 'Show 1', saldoDevedor: 3000, liberavel: 0 },
      { id: 'ev2', nome: 'Show 2', saldoDevedor: 0, liberavel: 1800 }
    ]
  });
  assert.equal(res.status, 'EmCobrancaResidual');
  assert.equal(res.totalDevedorBrutoCents, 300000);
  assert.equal(res.compensadoEntreEventosCents, 180000);
  assert.equal(res.dividaResidualCents, 120000);
});
