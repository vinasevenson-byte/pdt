import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validarLancamentoDespesaFornecedor } = require('../domain/index.js');

test('admin/fornecedores — validação de despesa operacional com CNPJ e geração de título a pagar', () => {
  const val = validarLancamentoDespesaFornecedor(
    {
      despesaId: 'desp_seg_01',
      eventoId: 'polaquedo',
      fornecedorNome: 'Segurança Paraná Ltda',
      cnpjFornecedor: '11.222.333/0001-81',
      descricao: 'Equipe extra de brigadistas',
      valor: 1200,
      status: 'A pagar',
      comNota: true,
      numeroNota: 'NF-9981'
    },
    {
      eventoExistente: { id: 'polaquedo', produtoraId: 'prod_exemplo', ativo: true }
    }
  );
  assert.equal(val.valorCents, 120000);
  assert.equal(val.tituloPagar.id, 'cp_desp_desp_seg_01');
  assert.equal(val.registroFornecedor.documento, '11.222.333/0001-81');
});
