import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { calcularVendas, validarIngestaoVendasLote } = require('../domain/index.js');
const { validarVendas } = require('../contract/index.js');

test('operacao/vendas — cálculo em centavos e validação de ingestão de lote', () => {
  const calc = calcularVendas({
    loteId: 'lote_01',
    eventoId: 'polaquedo',
    produtoraId: 'prod_exemplo',
    setor: 'Pista',
    quantidadeVendida: 50,
    quantidadeCortesias: 5,
    precoUnitario: 40
  });
  assert.equal(calc.valorBrutoCents, 200000);
  assert.equal(calc.valorBruto, 2000);

  const val = validarVendas({
    eventoId: 'polaquedo',
    quantidadeVendida: 10,
    quantidadeCortesias: 0
  });
  assert.equal(val.valido, true);
});
