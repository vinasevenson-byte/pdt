import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { filtrarTrilhaAuditoria, verificarIntegridadeAssinaturasRepasses } = require('../domain/index.js');

test('admin/auditoria_vis — filtro de trilha e verificação de assinaturas eletrônicas', () => {
  const trilha = filtrarTrilhaAuditoria(
    {
      a1: { modulo: 'Repasses', usuario: 'fin@disk.com', eventoId: 'festival', acao: 'Aprovar', resumo: 'Repasse aprovado' },
      a2: { modulo: 'CadastroMestre', usuario: 'com@disk.com', eventoId: 'polaquedo', acao: 'Criar', resumo: 'Evento criado' }
    },
    { modulo: 'Repasses' }
  );
  assert.equal(trilha.totalRegistros, 2);
  assert.equal(trilha.totalFiltrados, 1);

  const verif = verificarIntegridadeAssinaturasRepasses({
    r1: {
      produtoraId: 'prod_exemplo',
      status: 'Aprovado',
      valorSolicitado: 1000,
      assinaturaEletronica: { aceito: true, ip: '127.0.0.1', dataHora: '27/10/2026 10:00' }
    }
  });
  assert.equal(verif.qtdComAssinaturaCompleta, 1);
  assert.equal(verif.seloConformidadeSha256.length, 64);
});
