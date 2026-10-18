import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('apps/produtor');

async function walk(dir) {
  let out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}

test('produtor não depende do motor financeiro', async () => {
  const p = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.ok(!p.dependencies?.['@disk/motor-repasse']);
});

test('produtor não contém identificadores internos proibidos em fonte nem build', async () => {
  for (const f of await walk(path.join(root, 'src'))) {
    if (!/\.(tsx?|jsx?|json)$/.test(f)) continue;
    const c = await readFile(f, 'utf8');
    for (const k of ['taxaAdm', 'taxaOp', 'eventos_fin', '@disk/motor-repasse']) {
      assert.equal(c.includes(k), false, `${k} em ${f}`);
    }
  }
  const dist = path.join(root, 'dist');
  let files = [];
  try {
    files = await walk(dist);
  } catch {
    return;
  }
  for (const f of files) {
    if (!/\.(js|html|css)$/.test(f)) continue;
    const c = await readFile(f, 'utf8');
    for (const k of ['taxaAdm', 'taxaOp', 'eventos_fin', '@disk/motor-repasse']) {
      assert.equal(c.includes(k), false, `${k} no build`);
    }
  }
});

test('produtor não utiliza dados demonstrativos fixos e conecta ao Firebase real por produtoraId', async () => {
  for (const f of await walk(path.join(root, 'src'))) {
    if (!/\.(tsx?|jsx?)$/.test(f)) continue;
    const c = await readFile(f, 'utf8');
    assert.equal(c.includes('PROJECAO_INICIAL_PRODUTOR'), false, `Dado demonstrativo fixo encontrado em ${f}`);
    assert.equal(c.includes('Produtora Exemplo Curitiba Ltda'), false, `Nome demonstrativo fixo encontrado em ${f}`);
  }

  const fbClient = await readFile(path.join(root, 'src/shared/firebaseProdutor.ts'), 'utf8');
  assert.ok(fbClient.includes('onAuthStateChanged'), 'Deve validar sessão real no Firebase Auth');
  assert.ok(fbClient.includes("role === 'produtor'"), 'Deve validar claim role === produtor');
  assert.ok(fbClient.includes('onValue'), 'Deve assinar nós reais do RTDB com onValue');
  assert.ok(fbClient.includes('httpsCallable'), 'Deve acionar Cloud Functions reais com httpsCallable');
});

test('fluxo de repasses exige assinatura eletrônica de aceite, aprovação financeira e auditoria', async () => {
  const callablesCode = await readFile(path.resolve('services/functions/src/callables/index.js'), 'utf8');
  assert.ok(callablesCode.includes('assinaturaSolicitante'), 'Deve gravar assinaturaSolicitante no repasse');
  assert.ok(callablesCode.includes('aceiteBancario'), 'Deve validar aceiteBancario');
  assert.ok(callablesCode.includes('aceiteTermosBordero'), 'Deve validar aceiteTermosBordero');
  assert.ok(callablesCode.includes('assinaturaFinanceiro'), 'Deve gravar assinaturaFinanceiro na decisão');
  assert.ok(callablesCode.includes('registrarAuditoria'), 'Deve registrar trilha de auditoria');
});
