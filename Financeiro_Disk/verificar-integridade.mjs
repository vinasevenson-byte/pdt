import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
const expected = JSON.parse(readFileSync(new URL('./integridade.json', import.meta.url)));
for (const name of ['index.html','referencia-original.html']) {
 const actual = createHash('sha256').update(readFileSync(new URL('./'+name,import.meta.url))).digest('hex');
 assert.equal(actual, expected.sha256, `Arquivo alterado: ${name}`);
}
console.log('OK: interface idêntica ao HTML de referência');
