#!/usr/bin/env node
/**
 * Scaffolder de Módulos Verticais com Manifesto — Hub de Repasses DiskIngressos
 * Uso:
 *   npm run module:new -- financeiro/estornos --no estornos
 *   npm run module:new -- financeiro/conciliacao --no conciliacoes --java
 *   npm run module:new -- comercial/contratos --no contratos --produtor dono
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMINIOS_PERMITIDOS, executarBuildModulos } from './module-build.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function toPascal(str) {
  return String(str)
    .split(/[-_]/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

export function parseArgsScaffolder(argv = []) {
  const positional = [];
  let noRtdb = null;
  let usarJava = false;
  let leituraProdutor = 'nenhuma';
  let temUiProdutor = false;
  let escritaCliente = 'nenhuma';
  const dependencias = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no' && argv[i + 1]) {
      noRtdb = argv[++i];
    } else if (arg.startsWith('--no=')) {
      noRtdb = arg.slice('--no='.length);
    } else if (arg === '--java') {
      usarJava = true;
    } else if (arg === '--produtor') {
      temUiProdutor = true;
      const prox = argv[i + 1];
      if (prox && !prox.startsWith('--')) {
        leituraProdutor = prox === 'resumo' ? 'projecao' : prox;
        i++;
      } else {
        leituraProdutor = 'dono';
      }
    } else if (arg.startsWith('--produtor=')) {
      temUiProdutor = true;
      const val = arg.slice('--produtor='.length);
      leituraProdutor = val === 'resumo' ? 'projecao' : val;
    } else if (arg === '--dep' && argv[i + 1]) {
      dependencias.push(...argv[++i].split(',').map(s => s.trim()).filter(Boolean));
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  const alvo = positional[0] || '';
  return {
    alvo,
    noRtdb,
    usarJava,
    temUiProdutor,
    leituraProdutor,
    escritaCliente,
    dependencias
  };
}

export function criarModuloVertical(opcoes, rootDir = ROOT_DIR) {
  const {
    alvo,
    noRtdb: noInformado,
    usarJava = false,
    temUiProdutor = false,
    leituraProdutor = 'nenhuma',
    escritaCliente = 'nenhuma',
    dependencias = ['core']
  } = opcoes;

  const partes = String(alvo || '').split('/');
  if (partes.length !== 2) {
    throw new Error('Informe o módulo no formato <dominio>/<modulo> (ex.: financeiro/estornos).');
  }

  const [dominio, moduloRaw] = partes;
  const modulo = moduloRaw.toLowerCase().replace(/-/g, '_');

  if (!DOMINIOS_PERMITIDOS.includes(dominio)) {
    throw new Error(`Domínio "${dominio}" inválido. Domínios permitidos: ${DOMINIOS_PERMITIDOS.join(', ')}.`);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(modulo)) {
    throw new Error(`Nome de módulo "${modulo}" inválido. Use snake_case minúsculo.`);
  }

  const noRtdb = (noInformado || modulo).toLowerCase().replace(/-/g, '_');
  const pascal = toPascal(modulo);
  const modDir = path.join(rootDir, 'modules', dominio, modulo);

  if (fs.existsSync(modDir)) {
    throw new Error(`O módulo "${dominio}/${modulo}" já existe em modules/${dominio}/${modulo}.`);
  }

  const manifest = {
    id: `${dominio}/${modulo}`,
    dominio,
    modulo,
    titulo: pascal,
    descricao: `Módulo vertical ${pascal} (${dominio}/${modulo})`,
    camada: usarJava ? 'java' : 'node',
    rolesPermitidas: temUiProdutor ? ['financeiro', 'produtor'] : ['financeiro'],
    rtdb: {
      no: noRtdb,
      leituraProdutor: temUiProdutor ? (leituraProdutor === 'nenhuma' ? 'dono' : leituraProdutor) : 'nenhuma',
      escritaCliente,
      camposObrigatorios: ['produtoraId', 'status']
    },
    ui: {
      financeiro: true,
      produtor: Boolean(temUiProdutor)
    },
    dependencias: dependencias.length > 0 ? dependencias : ['core'],
    eventosEmitidos: [`${dominio}.${modulo}.processado`],
    featureFlag: `ff_${dominio}_${modulo}`
  };

  function writeRel(relPath, content) {
    const abs = path.join(modDir, relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }

  // 1. manifest.json
  writeRel('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

  // 2. domain/index.js (aritmética em centavos)
  writeRel(
    'domain/index.js',
    `/**
 * Domínio Puro (em centavos) — Módulo ${pascal} (${dominio}/${modulo})
 */
'use strict';

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function calcular${pascal}(registro = {}) {
  const valorBaseCents = toCents(registro.valorBase || registro.valor || 0);
  const abatimentoCents = toCents(registro.abatimento || 0);
  const liquidoCents = Math.max(0, valorBaseCents - abatimentoCents);

  return {
    id: registro.id || null,
    produtoraId: registro.produtoraId || null,
    eventoId: registro.eventoId || null,
    valorBaseCents,
    valorBase: fromCents(valorBaseCents),
    abatimentoCents,
    abatimento: fromCents(abatimentoCents),
    valorLiquidoCents: liquidoCents,
    valorLiquido: fromCents(liquidoCents),
    status: registro.status || 'Pendente'
  };
}

module.exports = {
  calcular${pascal}
};
`
  );

  // 3. contract/index.js
  writeRel(
    'contract/index.js',
    `/**
 * Contrato e Validador de Schema — Módulo ${pascal} (/${noRtdb})
 */
'use strict';

const RTDB_NODE = '${noRtdb}';

function validar${pascal}(payload = {}) {
  const erros = [];
  if (!payload || typeof payload !== 'object') {
    return { valido: false, erros: ['Payload inválido.'] };
  }
  if (!payload.produtoraId || typeof payload.produtoraId !== 'string') {
    erros.push('produtoraId é obrigatório.');
  }
  if (!payload.status || typeof payload.status !== 'string') {
    erros.push('status é obrigatório.');
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

  // 4. Backend: functions/index.js (Node) ou java/ (Spring Boot)
  if (usarJava) {
    writeRel(
      `java/${pascal}Service.java`,
      `package br.com.diskingressos.${dominio}.${modulo};

import org.springframework.stereotype.Service;

@Service
public class ${pascal}Service {
    public String getNode() {
        return "${noRtdb}";
    }
}
`
    );
  } else {
    writeRel(
      'functions/index.js',
      `/**
 * Cloud Function Handler — Módulo ${pascal} (${dominio}/${modulo})
 */
'use strict';

const { httpsV2, registrarAuditoria } = require('../../../../services/functions/src/shared/recalculo');
const { validar${pascal} } = require('../contract');
const { onCall, HttpsError } = httpsV2;

exports.processar_${dominio}_${modulo} = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Acesso restrito ao perfil Financeiro.');
  }

  const validacao = validar${pascal}(request.data || {});
  if (!validacao.valido) {
    throw new HttpsError('invalid-argument', validacao.erros.join(' '));
  }

  await registrarAuditoria({
    usuario: auth.token.email || auth.uid,
    modulo: '${dominio}/${modulo}',
    eventoId: request.data.eventoId || '',
    acao: 'Processar ${pascal}',
    resumo: \`Processamento no nó /${noRtdb}\`
  });

  return { ok: true, id: '${dominio}/${modulo}', no: '${noRtdb}' };
});
`
    );
  }

  // 5. UI Financeiro: ui/index.tsx
  writeRel(
    'ui/index.tsx',
    `import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: '${modulo}',
  title: '${pascal}',
  description: 'Módulo vertical ${pascal} (${dominio}/${modulo}) conectado a /${noRtdb}.',
  rtdbNode: '${noRtdb}',
  requiresJavaService: ${Boolean(usarJava)},
  render: () => (
    <section className="card">
      <h2 className="h2">${pascal}</h2>
      <p className="sub">Domínio: <strong>${dominio}</strong> · Nó RTDB: <code>/${noRtdb}</code></p>
    </section>
  )
};
`
  );

  // 6. UI Produtor opcional: ui-produtor/index.tsx (sem qualquer termo proibido!)
  if (temUiProdutor) {
    writeRel(
      'ui-produtor/index.tsx',
      `export function ProdutorModuleView() {
  return (
    <section className="card">
      <h2 className="h2">${pascal}</h2>
      <p className="sub">Consulta disponível para a sua produtora em <code>/${noRtdb}</code>.</p>
    </section>
  );
}
`
    );
  }

  // 7. Teste do módulo: test/module.test.js
  writeRel(
    'test/module.test.js',
    `'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcular${pascal} } = require('../domain');
const { validar${pascal}, RTDB_NODE } = require('../contract');

test('Módulo ${dominio}/${modulo} — cálculo em centavos e contrato RTDB', () => {
  assert.equal(RTDB_NODE, '${noRtdb}');
  const calc = calcular${pascal}({ id: '1', produtoraId: 'prod_exemplo', valorBase: 100.55, abatimento: 20.05 });
  assert.equal(calc.valorLiquidoCents, 8050);
  assert.equal(calc.valorLiquido, 80.50);

  assert.equal(validar${pascal}({ produtoraId: 'prod_exemplo', status: 'Ativo' }).valido, true);
  assert.equal(validar${pascal}({}).valido, false);
});
`
  );

  // Executa o build para validar e regenerar os artefatos
  executarBuildModulos(rootDir);

  return {
    id: manifest.id,
    dir: modDir,
    manifest
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const opts = parseArgsScaffolder(process.argv.slice(2));
    const criado = criarModuloVertical(opts, ROOT_DIR);
    console.log(`✅ Módulo vertical "${criado.id}" criado em ${path.relative(ROOT_DIR, criado.dir)} e registrado com sucesso!`);
  } catch (err) {
    console.error(`❌ Erro ao criar módulo: ${err.message}`);
    process.exit(1);
  }
}
