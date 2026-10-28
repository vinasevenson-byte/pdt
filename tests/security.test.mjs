import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('apps/produtor');
const portalProdutorIndependente = path.resolve('Portal_Produtor_DiskIngressos');
const financeiroIndependente = path.resolve('Financeiro_DiskIngressos');

async function walk(dir) {
  let out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'referencia-original') continue;
    const p = path.join(dir, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}

test('produtor não depende do motor financeiro (monorepo e portal independente)', async () => {
  for (const dir of [root, portalProdutorIndependente]) {
    const p = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    assert.ok(!p.dependencies?.['@disk/motor-repasse']);
    assert.ok(!p.dependencies?.['@diskingressos/motor-repasse']);
  }
});

test('produtor não contém identificadores internos proibidos em fonte nem build', async () => {
  for (const dir of [root, portalProdutorIndependente]) {
    for (const f of await walk(path.join(dir, 'src'))) {
      if (!/\.(tsx?|jsx?|json)$/.test(f)) continue;
      const c = await readFile(f, 'utf8');
      for (const k of ['taxaAdm', 'taxaOp', 'eventos_fin', '@disk/motor-repasse', 'motorRepasse']) {
        assert.equal(c.includes(k), false, `${k} em ${f}`);
      }
    }
  }
});

test('produtor não utiliza dados demonstrativos fixos e conecta ao Firebase real por produtoraId', async () => {
  for (const dir of [root, portalProdutorIndependente]) {
    for (const f of await walk(path.join(dir, 'src'))) {
      if (!/\.(tsx?|jsx?)$/.test(f)) continue;
      const c = await readFile(f, 'utf8');
      assert.equal(c.includes('PROJECAO_INICIAL_PRODUTOR'), false, `Dado demonstrativo fixo encontrado em ${f}`);
      assert.equal(c.includes('Produtora Exemplo Curitiba Ltda'), false, `Nome demonstrativo fixo encontrado em ${f}`);
    }

    const fbClient = await readFile(path.join(dir, 'src/shared/firebaseProdutor.ts'), 'utf8');
    assert.ok(fbClient.includes('onAuthStateChanged'), 'Deve validar sessão real no Firebase Auth');
    assert.ok(fbClient.includes("role === 'produtor'"), 'Deve validar claim role === produtor');
    assert.ok(fbClient.includes('onValue'), 'Deve assinar nós reais do RTDB com onValue');
    assert.ok(fbClient.includes('httpsCallable'), 'Deve acionar Cloud Functions reais com httpsCallable');
  }
});

test('financeiro independente exige role === financeiro e conecta módulos ao RTDB e decidirRepasse', async () => {
  const fbFin = await readFile(path.join(financeiroIndependente, 'src/shared/firebaseFinanceiro.ts'), 'utf8');
  assert.ok(fbFin.includes("role === 'financeiro'"), 'Financeiro deve exigir claim role === financeiro');
  assert.ok(fbFin.includes('onValue'), 'Financeiro deve assinar nós do RTDB em tempo real');
  assert.ok(fbFin.includes('decidirRepasse'), 'Financeiro deve conectar ao callable decidirRepasse');

  const refDir = path.join(portalProdutorIndependente, 'referencia-original');
  const candidatos = [
    'Hub de Repasses – Produtor — acesso limitado.html',
    'Hub de Repasses #U2013 Produtor #U2014 acesso limitado.html',
    'DiskIngressos – Produtor — acesso limitado.html',
    'DiskIngressos #U2013 Produtor #U2014 acesso limitado.html',
    'referencia-original-produtor.html'
  ];
  const entries = await readdir(refDir);
  const escolhido =
    candidatos.find(c => entries.includes(c)) ||
    entries.find(e => e.endsWith('.html') && e.includes('acesso limitado'));
  assert.ok(escolhido, `HTML de referência original não encontrado em ${refDir}`);
  const htmlRef = await readFile(path.join(refDir, escolhido));
  assert.equal(
    createHash('sha256').update(htmlRef).digest('hex'),
    'd423a4a13ae00048d7d96ea54fd68663a7a98ccc70b5b18c0976b40c98b1f583'
  );
});

test('fluxo de repasses exige assinatura eletrônica de aceite, aprovação financeira e auditoria', async () => {
  const callablesCode = await readFile(path.resolve('services/functions/src/callables/index.js'), 'utf8');
  assert.ok(callablesCode.includes('assinaturaSolicitante'), 'Deve gravar assinaturaSolicitante no repasse');
  assert.ok(callablesCode.includes('aceiteBancario'), 'Deve validar aceiteBancario');
  assert.ok(callablesCode.includes('aceiteTermosBordero'), 'Deve validar aceiteTermosBordero');
  assert.ok(callablesCode.includes('assinaturaFinanceiro'), 'Deve gravar assinaturaFinanceiro na decisão');
  assert.ok(callablesCode.includes('registrarAuditoria'), 'Deve registrar trilha de auditoria');
});
