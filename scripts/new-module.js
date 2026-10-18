#!/usr/bin/env node
/**
 * Gerador de Módulo Financeiro Plugável — Hub de Repasses DiskIngressos
 * Uso:
 *   npm run new:module <nome> [-- --produtor] [-- --java]
 *
 * Cria automaticamente o esqueleto padronizado nas camadas:
 * 1. Domínio puro:   packages/motor-repasse/src/modules/<nome>/index.js
 * 2. Teste unitário: packages/motor-repasse/test/<nome>.test.js
 * 3. Contrato RTDB:  packages/contracts/src/<nome>/index.js
 * 4. Backend:        services/functions/src/modules/<nome>/index.js (ou pacote Java se --java)
 * 5. UI Financeiro:  apps/financeiro/src/modules/<nome>/index.tsx
 * 6. UI Produtor:    apps/produtor/src/modules/<nome>/index.tsx (somente se --produtor)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const rawName = args.find(a => !a.startsWith('--'));
const incluirProdutor = args.includes('--produtor');
const incluirJava = args.includes('--java');

if (!rawName || !/^[a-z][a-z0-9_-]*$/.test(rawName)) {
  console.error('Uso: npm run new:module <nome-minusculo> [-- --produtor] [-- --java]');
  process.exit(1);
}

const modulo = rawName.toLowerCase().replace(/-/g, '_');
const pascal = modulo
  .split('_')
  .map(p => p.charAt(0).toUpperCase() + p.slice(1))
  .join('');

const ROOT = path.resolve(__dirname, '..');

function writeIfMissing(relPath, content) {
  const abs = path.join(ROOT, relPath);
  if (fs.existsSync(abs)) {
    console.log(`⚠️  Já existe (ignorado): ${relPath}`);
    return;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  console.log(`✅ Criado: ${relPath}`);
}

// 1. Domínio puro
writeIfMissing(
  `packages/motor-repasse/src/modules/${modulo}/index.js`,
  `/**
 * Domínio Puro — Módulo ${pascal} (${modulo})
 * Cálculo puro, sem I/O. NUNCA deve ser importado no app do Produtor.
 */

'use strict';

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function calcular${pascal}(registro = {}, parametros = {}) {
  const valorBase = round2(registro.valorBase || 0);
  const aliquotaPct = round2(parametros.aliquotaPct || 0);
  const valorCalculado = round2(valorBase * (aliquotaPct / 100));
  const valorLiquido = round2(Math.max(0, valorBase - valorCalculado));

  return {
    id: registro.id || null,
    eventoId: registro.eventoId || null,
    produtoraId: registro.produtoraId || null,
    valorBase,
    aliquotaPct,
    valorCalculado,
    valorLiquido
  };
}

module.exports = {
  calcular${pascal}
};
`
);

// 2. Teste unitário do módulo
writeIfMissing(
  `packages/motor-repasse/test/${modulo}.test.js`,
  `const test = require('node:test');
const assert = require('node:assert/strict');
const { calcular${pascal} } = require('../src/modules/${modulo}');

test('Módulo ${pascal} — cálculo puro básico', () => {
  const res = calcular${pascal}({ id: 'reg_1', valorBase: 1000 }, { aliquotaPct: 5 });
  assert.equal(res.valorCalculado, 50);
  assert.equal(res.valorLiquido, 950);
});
`
);

// 3. Contrato RTDB
writeIfMissing(
  `packages/contracts/src/${modulo}/index.js`,
  `/**
 * Contrato RTDB — Módulo ${pascal} (/${modulo})
 */

'use strict';

const RTDB_NODE = '${modulo}';

function validar${pascal}(payload = {}) {
  const erros = [];
  if (!payload.produtoraId || typeof payload.produtoraId !== 'string') {
    erros.push('produtoraId obrigatório.');
  }
  return {
    valido: erros.length === 0,
    erros
  };
}

module.exports = {
  RTDB_NODE,
  validar${pascal}
};
`
);

// 4. Backend (Cloud Functions)
writeIfMissing(
  `services/functions/src/modules/${modulo}/index.js`,
  `/**
 * Handler Cloud Functions — Módulo ${pascal}
 */

'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { registrarAuditoria } = require('../../shared/recalculo');

exports.processar${pascal} = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Acesso restrito ao perfil Financeiro.');
  }

  const usuario = auth.token.email || auth.uid;
  const { eventoId = '', resumo = 'Processamento em ${pascal}' } = request.data || {};

  await registrarAuditoria({
    usuario,
    modulo: '${pascal}',
    eventoId,
    acao: 'Processar ${pascal}',
    resumo
  });

  return { ok: true, modulo: '${modulo}' };
});
`
);

// 5. UI Financeiro
writeIfMissing(
  `apps/financeiro/src/modules/${modulo}/index.tsx`,
  `import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const ${modulo}Module: FinancialModulePlugin = {
  id: '${modulo}',
  title: '${pascal}',
  description: 'Módulo financeiro ${pascal} conectado ao nó /${modulo}.',
  rtdbNode: '${modulo}',
  requiresJavaService: ${Boolean(incluirJava)},
  render: () => (
    <section>
      <h2>${pascal}</h2>
      <p>Painel do módulo <code>/${modulo}</code> (restrito ao perfil Financeiro).</p>
    </section>
  )
};
`
);

// 6. UI Produtor (somente se solicitado explicitamente com --produtor)
if (incluirProdutor) {
  writeIfMissing(
    `apps/produtor/src/modules/${modulo}/index.tsx`,
    `export function ${pascal}ProdutorModule() {
  return (
    <section>
      <h2>${pascal}</h2>
      <p>Visão limpa projetada para a produtora autenticada.</p>
    </section>
  );
}
`
  );
}

// 7. Serviço Java opcional (se --java)
if (incluirJava) {
  writeIfMissing(
    `services/financeiro-java/src/main/java/br/com/diskingressos/${modulo}/${pascal}Service.java`,
    `package br.com.diskingressos.${modulo};

import org.springframework.stereotype.Service;

@Service
public class ${pascal}Service {
}
`
  );
}

console.log(\`\\n🎉 Módulo "\${modulo}" gerado! Adicione a regra de segurança correspondente em firebase/database.rules.json.\`);
