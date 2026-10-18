import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const base='legacy/produtor-original';
test('HTML original preservado com integridade verificável',async()=>{
 const inventory=JSON.parse(await readFile(path.join(base,'inventario.json'),'utf8'));
 const html=await readFile(path.join(base,'Hub de Repasses – Produtor — acesso limitado.html'));
 assert.equal(createHash('sha256').update(html).digest('hex'),inventory.sha256_original);
});
test('arquivo legado não foi copiado para o diretório público do produtor',async()=>{
 const {existsSync}=await import('node:fs');
 assert.equal(existsSync('apps/produtor/public/Hub de Repasses – Produtor — acesso limitado.html'),false);
});
