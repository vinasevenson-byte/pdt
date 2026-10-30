#!/usr/bin/env node
/**
 * Compilador e Validador de Módulos Verticais do ERP (`modules/<dominio>/<modulo>/manifest.json`)
 * Comandos:
 *   npm run module:build  -> Valida manifestos e regenera regras RTDB, registros de UI/Functions e catálogo
 *   npm run module:check  -> Verifica integridade e falha se algum artefato gerado estiver desatualizado
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const DOMINIOS_PERMITIDOS = ['financeiro', 'comercial', 'operacao', 'admin', 'plataforma'];
export const DEPENDENCIAS_NUCLEO = new Set([
  'core',
  'ledger',
  'saldos',
  'repasses',
  'negociacoes',
  'eventos',
  'contas_pagar',
  'contas_receber',
  'auditoria',
  'eventos_dominio'
]);
export const TERMOS_PROIBIDOS_PRODUTOR = [
  'taxaAdm',
  'taxaOp',
  'conveniencia',
  'eventos_fin',
  'negociacoes',
  'motorRepasse',
  'motor-repasse'
];

function lerCoreRules(rootDir = ROOT_DIR) {
  const corePath = path.join(rootDir, 'firebase/rules.core.json');
  return JSON.parse(fs.readFileSync(corePath, 'utf8'));
}

function listarArquivosRecursivo(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dirPath, e.name);
    if (e.isDirectory()) out.push(...listarArquivosRecursivo(full));
    else out.push(full);
  }
  return out;
}

/**
 * Descobre todos os manifestos em modules/<dominio>/<modulo>/manifest.json
 */
export function carregarManifestos(rootDir = ROOT_DIR) {
  const modulesDir = path.join(rootDir, 'modules');
  if (!fs.existsSync(modulesDir)) return [];

  const manifestos = [];
  for (const domEntry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!domEntry.isDirectory() || domEntry.name.startsWith('_') || domEntry.name.startsWith('.')) continue;
    const domPath = path.join(modulesDir, domEntry.name);
    for (const modEntry of fs.readdirSync(domPath, { withFileTypes: true })) {
      if (!modEntry.isDirectory() || modEntry.name.startsWith('_') || modEntry.name.startsWith('.')) continue;
      const manifestPath = path.join(domPath, modEntry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifestos.push({
        pastaDominio: domEntry.name,
        pastaModulo: modEntry.name,
        dirAbs: path.join(domPath, modEntry.name),
        manifestPath,
        manifest: raw
      });
    }
  }

  return manifestos.sort((a, b) =>
    `${a.pastaDominio}/${a.pastaModulo}`.localeCompare(`${b.pastaDominio}/${b.pastaModulo}`)
  );
}

/**
 * Valida uma lista de manifestos e retorna erros detalhados (ou lança exceção se houver falha).
 */
export function validarManifestos(itens, coreRulesObj) {
  const erros = [];
  const nosNucleo = new Set(Object.keys((coreRulesObj && coreRulesObj.rules) || {}));
  const nosModulos = new Map();
  const idsModulos = new Map();

  for (const item of itens) {
    const { pastaDominio, pastaModulo, dirAbs, manifest } = item;
    const chavePasta = `${pastaDominio}/${pastaModulo}`;

    // 1. Domínio válido e consistente com a pasta
    if (!DOMINIOS_PERMITIDOS.includes(pastaDominio)) {
      erros.push(`[${chavePasta}] Domínio da pasta "${pastaDominio}" inválido. Permitidos: ${DOMINIOS_PERMITIDOS.join(', ')}.`);
    }
    if (manifest.dominio !== pastaDominio) {
      erros.push(`[${chavePasta}] manifest.dominio ("${manifest.dominio}") difere da pasta de domínio ("${pastaDominio}").`);
    }
    if (manifest.modulo !== pastaModulo) {
      erros.push(`[${chavePasta}] manifest.modulo ("${manifest.modulo}") difere da pasta do módulo ("${pastaModulo}").`);
    }
    const idEsperado = `${pastaDominio}/${pastaModulo}`;
    if (manifest.id !== idEsperado) {
      erros.push(`[${chavePasta}] manifest.id deve ser "${idEsperado}" (encontrado: "${manifest.id}").`);
    }
    idsModulos.set(manifest.id, item);
    idsModulos.set(pastaModulo, item);

    // 2. Nó do RTDB e colisões
    const noRtdb = manifest.rtdb && manifest.rtdb.no;
    if (!noRtdb || !/^[a-z][a-z0-9_]*$/.test(noRtdb)) {
      erros.push(`[${chavePasta}] manifest.rtdb.no inválido ("${noRtdb}"). Use snake_case minúsculo.`);
    } else {
      if (nosNucleo.has(noRtdb)) {
        erros.push(`[${chavePasta}] Colisão de nó RTDB: "/${noRtdb}" já pertence ao núcleo (firebase/rules.core.json).`);
      }
      if (nosModulos.has(noRtdb)) {
        erros.push(`[${chavePasta}] Colisão de nó RTDB: "/${noRtdb}" já foi declarado pelo módulo "${nosModulos.get(noRtdb)}".`);
      }
      nosModulos.set(noRtdb, chavePasta);
    }

    // 3. Escrita de cliente (nenhuma por padrão)
    const escritaCliente = (manifest.rtdb && manifest.rtdb.escritaCliente) || 'nenhuma';
    if (!['nenhuma', 'financeiro'].includes(escritaCliente)) {
      erros.push(`[${chavePasta}] manifest.rtdb.escritaCliente inválido ("${escritaCliente}"). Use "nenhuma" (padrão) ou "financeiro".`);
    }

    // 4. Regras de isolamento do Produtor
    const temUiProdutor = Boolean(manifest.ui && manifest.ui.produtor);
    const leituraProdutor = (manifest.rtdb && manifest.rtdb.leituraProdutor) || 'nenhuma';
    if (temUiProdutor && leituraProdutor === 'nenhuma') {
      erros.push(`[${chavePasta}] Módulo declara ui.produtor=true, mas rtdb.leituraProdutor é "nenhuma" (declare "dono" ou "projecao").`);
    }

    // Varre ui-produtor/ atrás de termos proibidos
    const uiProdDir = path.join(dirAbs, 'ui-produtor');
    if (fs.existsSync(uiProdDir)) {
      for (const file of listarArquivosRecursivo(uiProdDir)) {
        const conteudo = fs.readFileSync(file, 'utf8');
        for (const termo of TERMOS_PROIBIDOS_PRODUTOR) {
          if (conteudo.includes(termo)) {
            erros.push(`[${chavePasta}] Arquivo do produtor (${path.relative(dirAbs, file)}) contém termo proibido: "${termo}".`);
          }
        }
      }
    }
  }

  // 5. Dependências inexistentes e ciclos (DFS)
  const grafo = new Map();
  for (const item of itens) {
    const id = item.manifest.id;
    const deps = Array.isArray(item.manifest.dependencias) ? item.manifest.dependencias : [];
    const depsModulos = [];
    for (const dep of deps) {
      if (DEPENDENCIAS_NUCLEO.has(dep)) continue;
      const alvo = idsModulos.get(dep);
      if (!alvo) {
        erros.push(`[${id}] Dependência inexistente: "${dep}" não é módulo registrado nem capacidade do núcleo.`);
      } else {
        depsModulos.push(alvo.manifest.id);
      }
    }
    grafo.set(id, depsModulos);
  }

  const visitando = new Set();
  const visitado = new Set();

  function detectarCiclo(noAtual, trilha) {
    if (visitando.has(noAtual)) {
      erros.push(`Dependência cíclica detectada entre módulos: ${[...trilha, noAtual].join(' -> ')}`);
      return;
    }
    if (visitado.has(noAtual)) return;
    visitando.add(noAtual);
    for (const vizinho of grafo.get(noAtual) || []) {
      detectarCiclo(vizinho, [...trilha, noAtual]);
    }
    visitando.delete(noAtual);
    visitado.add(noAtual);
  }

  for (const id of grafo.keys()) {
    detectarCiclo(id, []);
  }

  return {
    valido: erros.length === 0,
    erros
  };
}

/**
 * Gera a regra RTDB para um módulo vertical a partir do seu manifest.json.
 * Escrita de cliente é false ("nenhuma") por padrão — escrita ocorre no servidor via Admin SDK / serviço Java.
 */
export function gerarRegraRTDBModulo(manifest) {
  const leituraProdutor = (manifest.rtdb && manifest.rtdb.leituraProdutor) || 'nenhuma';
  const escritaCliente = (manifest.rtdb && manifest.rtdb.escritaCliente) || 'nenhuma';
  const camposObrigatorios = Array.isArray(manifest.rtdb?.camposObrigatorios) && manifest.rtdb.camposObrigatorios.length > 0
    ? manifest.rtdb.camposObrigatorios
    : ['produtoraId'];

  const writeExpr = escritaCliente === 'financeiro'
    ? "auth != null && auth.token.role === 'financeiro'"
    : false;

  const listaCamposStr = camposObrigatorios.map(c => `'${c}'`).join(', ');

  if (leituraProdutor === 'dono') {
    return {
      '.read': "auth != null && (auth.token.role === 'financeiro' || (auth.token.role === 'produtor' && query.orderByChild === 'produtoraId' && query.equalTo === auth.token.produtoraId))",
      '.indexOn': ['produtoraId'],
      $itemId: {
        '.read': "auth != null && (auth.token.role === 'financeiro' || (auth.token.role === 'produtor' && data.child('produtoraId').val() === auth.token.produtoraId))",
        '.write': writeExpr,
        '.validate': `newData.hasChildren([${listaCamposStr}])`
      }
    };
  }

  if (leituraProdutor === 'projecao') {
    return {
      '.read': "auth != null && auth.token.role === 'financeiro'",
      $produtoraId: {
        '.read': "auth != null && (auth.token.role === 'financeiro' || (auth.token.role === 'produtor' && auth.token.produtoraId === $produtoraId))",
        '.write': false
      }
    };
  }

  return {
    '.read': "auth != null && auth.token.role === 'financeiro'",
    '.indexOn': ['produtoraId'],
    $itemId: {
      '.read': "auth != null && auth.token.role === 'financeiro'",
      '.write': writeExpr,
      '.validate': `newData.hasChildren([${listaCamposStr}])`
    }
  };
}

/**
 * Compila todos os artefatos derivados a partir dos manifestos e de firebase/rules.core.json.
 */
export function compilarArtefatosModulos(rootDir = ROOT_DIR) {
  const coreRules = lerCoreRules(rootDir);
  const itens = carregarManifestos(rootDir);
  const validacao = validarManifestos(itens, coreRules);

  if (!validacao.valido) {
    const msg = `Falha na validação dos manifestos de módulos:\n- ${validacao.erros.join('\n- ')}`;
    throw new Error(msg);
  }

  // 1. Regras RTDB mescladas (core + módulos)
  const mergedRules = structuredClone(coreRules);
  for (const { manifest } of itens) {
    mergedRules.rules[manifest.rtdb.no] = gerarRegraRTDBModulo(manifest);
  }
  const rulesJsonStr = JSON.stringify(mergedRules, null, 2) + '\n';

  // 2. Registro de UI Financeiro
  const finImports = [];
  const finEntries = [];
  for (const { pastaDominio, pastaModulo, dirAbs, manifest } of itens) {
    if (manifest.ui?.financeiro === false) continue;
    const uiFile = path.join(dirAbs, 'ui/index.tsx');
    if (fs.existsSync(uiFile)) {
      const varName = `${pastaDominio}_${pastaModulo}_Plugin`.replace(/[^a-zA-Z0-9_]/g, '_');
      finImports.push(`import { modulePlugin as ${varName} } from '../../../../modules/${pastaDominio}/${pastaModulo}/ui';`);
      finEntries.push(`  ${varName}`);
    }
  }
  const generatedFinUiStr = `/**
 * ARQUIVO GERADO AUTOMATICAMENTE POR \`npm run module:build\` — NÃO EDITE MANUALMENTE.
 */
import type { FinancialModulePlugin } from '../shared/modulePlugin';
${finImports.join('\n')}

export const VERTICAL_FINANCEIRO_MODULES: FinancialModulePlugin[] = [
${finEntries.join(',\n')}
];
`;

  // 3. Registro de UI Produtor
  const prodImports = [];
  const prodEntries = [];
  for (const { pastaDominio, pastaModulo, dirAbs, manifest } of itens) {
    if (!manifest.ui?.produtor) continue;
    const uiProdFile = path.join(dirAbs, 'ui-produtor/index.tsx');
    if (fs.existsSync(uiProdFile)) {
      const compName = `${pastaDominio}_${pastaModulo}_Produtor`.replace(/[^a-zA-Z0-9_]/g, '_');
      prodImports.push(`import { ProdutorModuleView as ${compName} } from '../../../../modules/${pastaDominio}/${pastaModulo}/ui-produtor';`);
      prodEntries.push(`  { id: '${manifest.modulo}', title: '${manifest.titulo}', Component: ${compName} }`);
    }
  }
  const generatedProdUiStr = `/**
 * ARQUIVO GERADO AUTOMATICAMENTE POR \`npm run module:build\` — NÃO EDITE MANUALMENTE.
 */
import type React from 'react';
${prodImports.join('\n')}

export interface VerticalProdutorModuleEntry {
  id: string;
  title: string;
  Component: React.ComponentType<Record<string, unknown>>;
}

export const VERTICAL_PRODUTOR_MODULES: VerticalProdutorModuleEntry[] = [
${prodEntries.join(',\n')}
];
`;

  // 4. Registro de Cloud Functions
  const fnRequires = [];
  for (const { pastaDominio, pastaModulo, dirAbs } of itens) {
    const fnFile = path.join(dirAbs, 'functions/index.js');
    if (fs.existsSync(fnFile)) {
      fnRequires.push(`  ...require('../../../../modules/${pastaDominio}/${pastaModulo}/functions')`);
    }
  }
  const generatedFnStr = `/**
 * ARQUIVO GERADO AUTOMATICAMENTE POR \`npm run module:build\` — NÃO EDITE MANUALMENTE.
 */
'use strict';

module.exports = {
${fnRequires.join(',\n')}
};
`;

  // 5. Catálogo Markdown
  const linhasCat = itens.map(({ manifest }) => {
    const deps = (manifest.dependencias || []).join(', ') || '—';
    const visProd = manifest.ui?.produtor ? `sim (${manifest.rtdb?.leituraProdutor})` : 'não';
    return `| \`${manifest.id}\` | ${manifest.dominio} | ${manifest.titulo} | \`/${manifest.rtdb.no}\` | ${manifest.camada} | ${visProd} | ${deps} |`;
  });
  const catalogoMdStr = `# Catálogo de Módulos Verticais Registrados (Gerado Automaticamente)

> Gerado por \`npm run module:build\`. Total de módulos verticais em \`modules/\`: **${itens.length}**.

| ID | Domínio | Título | Nó RTDB | Camada | Produtor vê? | Dependências |
|---|---|---|---|---|---|---|
${linhasCat.length > 0 ? linhasCat.join('\n') : '| *(nenhum módulo vertical criado ainda)* | — | — | — | — | — | — |'}
`;

  const arquivosAlvo = new Map([
    [path.join(rootDir, 'database.rules.json'), rulesJsonStr],
    [path.join(rootDir, 'firebase/database.rules.json'), rulesJsonStr],
    [path.join(rootDir, 'apps/financeiro/src/app/generatedModules.ts'), generatedFinUiStr],
    [path.join(rootDir, 'apps/produtor/src/app/generatedProdutorModules.ts'), generatedProdUiStr],
    [path.join(rootDir, 'services/functions/src/modules/generatedModules.js'), generatedFnStr],
    [path.join(rootDir, 'docs/CATALOGO-MODULOS.auto.md'), catalogoMdStr]
  ]);

  return {
    itens,
    arquivosAlvo
  };
}

export function executarBuildModulos(rootDir = ROOT_DIR) {
  const { itens, arquivosAlvo } = compilarArtefatosModulos(rootDir);
  for (const [absPath, content] of arquivosAlvo.entries()) {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
  }
  // Sincroniza cópias espelhadas se existirem
  const nucleoRules = path.join(rootDir, 'Nucleo_Financeiro_Compartilhado/firebase/database.rules.json');
  if (fs.existsSync(path.dirname(nucleoRules))) {
    fs.writeFileSync(nucleoRules, arquivosAlvo.get(path.join(rootDir, 'database.rules.json')), 'utf8');
  }
  const mirrorFinGen = path.join(rootDir, 'Financeiro_DiskIngressos/src/app/generatedModules.ts');
  if (fs.existsSync(path.dirname(mirrorFinGen))) {
    fs.writeFileSync(
      mirrorFinGen,
      arquivosAlvo
        .get(path.join(rootDir, 'apps/financeiro/src/app/generatedModules.ts'))
        .replaceAll('../../../../modules/', '../../../modules/'),
      'utf8'
    );
  }
  const mirrorProdGen = path.join(rootDir, 'Portal_Produtor_DiskIngressos/src/app/generatedProdutorModules.ts');
  if (fs.existsSync(path.dirname(mirrorProdGen))) {
    fs.writeFileSync(
      mirrorProdGen,
      arquivosAlvo
        .get(path.join(rootDir, 'apps/produtor/src/app/generatedProdutorModules.ts'))
        .replaceAll('../../../../modules/', '../../../modules/'),
      'utf8'
    );
  }
  return { totalModulos: itens.length, arquivosGerados: Array.from(arquivosAlvo.keys()) };
}

export function verificarBuildModulos(rootDir = ROOT_DIR) {
  const { arquivosAlvo } = compilarArtefatosModulos(rootDir);
  const desatualizados = [];
  const normEol = s => String(s || '').replace(/\r\n/g, '\n');
  for (const [absPath, expectedContent] of arquivosAlvo.entries()) {
    if (!fs.existsSync(absPath)) {
      desatualizados.push(`${path.relative(rootDir, absPath)} (ausente)`);
      continue;
    }
    const atual = fs.readFileSync(absPath, 'utf8');
    if (normEol(atual) !== normEol(expectedContent)) {
      desatualizados.push(`${path.relative(rootDir, absPath)} (divergente)`);
    }
  }
  return {
    ok: desatualizados.length === 0,
    desatualizados
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const isCheck = process.argv.includes('--check');
  try {
    if (isCheck) {
      const res = verificarBuildModulos(ROOT_DIR);
      if (!res.ok) {
        console.error(`❌ Artefatos de módulos desatualizados. Execute "npm run module:build":\n- ${res.desatualizados.join('\n- ')}`);
        process.exit(1);
      }
      console.log('✅ module:check — Todos os manifestos e artefatos gerados estão sincronizados.');
    } else {
      const res = executarBuildModulos(ROOT_DIR);
      console.log(`✅ module:build concluído (${res.totalModulos} módulo(s) vertical(is) processado(s)).`);
    }
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
