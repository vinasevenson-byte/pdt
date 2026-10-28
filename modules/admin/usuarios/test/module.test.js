import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { construirCustomClaimsERP, validarAtribuicaoPapelERP } = require('../domain/index.js');

test('admin/usuarios — construção de Custom Claims e segregação contra auto-alteração', () => {
  const claimsInterno = construirCustomClaimsERP({ papel: 'aprovador' });
  assert.deepEqual(claimsInterno, { role: 'financeiro', subRole: 'aprovador' });

  const claimsProd = construirCustomClaimsERP({ papel: 'produtor', produtoraId: 'prod_exemplo' });
  assert.deepEqual(claimsProd, { role: 'produtor', subRole: 'produtor', produtoraId: 'prod_exemplo' });

  assert.throws(
    () =>
      validarAtribuicaoPapelERP(
        { uid: 'u1', email: 'op@diskingressos.com.br', papel: 'financeiro', motivo: 'Tentativa própria' },
        { executorUid: 'u1', produtoras: {} }
      ),
    /Segregação de funções/i
  );
});
