import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const base = 'legacy/produtor-original';
const CANDIDATOS_HTML_ORIGINAL = [
  'Hub de Repasses – Produtor — acesso limitado.html',
  'Hub de Repasses #U2013 Produtor #U2014 acesso limitado.html',
  'DiskIngressos – Produtor — acesso limitado.html',
  'DiskIngressos #U2013 Produtor #U2014 acesso limitado.html',
  'referencia-original-produtor.html'
];

async function lerHtmlOriginal(dir) {
  for (const nome of CANDIDATOS_HTML_ORIGINAL) {
    const p = path.join(dir, nome);
    if (existsSync(p)) return readFile(p);
  }
  const entries = await readdir(dir);
  const fallback = entries.find(n => n.endsWith('.html') && n.includes('Produtor') && n.includes('acesso limitado'));
  if (fallback) return readFile(path.join(dir, fallback));
  throw new Error(`HTML original do produtor não encontrado em ${dir}`);
}

test('HTML original preservado com integridade verificável', async () => {
  const inventory = JSON.parse(await readFile(path.join(base, 'inventario.json'), 'utf8'));
  const html = await lerHtmlOriginal(base);
  assert.equal(createHash('sha256').update(html).digest('hex'), inventory.sha256_original);
});

test('arquivo legado não foi copiado para o diretório público do produtor', async () => {
  assert.equal(existsSync('apps/produtor/public/Hub de Repasses – Produtor — acesso limitado.html'), false);
});
