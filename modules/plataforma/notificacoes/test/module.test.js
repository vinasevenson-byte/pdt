import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { gerarNotificacoesDeOutbox } = require('../domain/index.js');

test('plataforma/notificacoes — geração de notificações limpas a partir do outbox /eventos_dominio', () => {
  const res = gerarNotificacoesDeOutbox(
    {
      evd_1: {
        tipo: 'LoteVendasRegistrado',
        produtoraId: 'prod_exemplo',
        eventoId: 'standup',
        referenciaId: 'lote_01',
        status: 'Pendente'
      }
    },
    '27/10/2026 21:00:00'
  );
  assert.equal(res.quantidadeEventosProcessados, 1);
  assert.equal(res.quantidadeNotificacoesGeradas, 1);
  assert.equal(res.notificacoesGeradas[0].produtoraId, 'prod_exemplo');
});
