import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const legacyHtmlPath = path.join(rootDir, 'legacy/produtor-original/Hub de Repasses – Produtor — acesso limitado.html');
const port = Number(process.env.PORT || 5185);

const ALLOWED_STATIC = {
  '/portal': { file: 'index.html', mime: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', mime: 'text/html; charset=utf-8' },
  '/produtor.html': { file: 'produtor.html', mime: 'text/html; charset=utf-8' },
  '/financeiro.html': { file: 'financeiro.html', mime: 'text/html; charset=utf-8' },
  '/Main.dc.html': { file: 'financeiro.html', mime: 'text/html; charset=utf-8' },
  '/motorRepasse.js': { file: 'motorRepasse.js', mime: 'application/javascript; charset=utf-8' },
  '/seed.json': { file: 'seed.json', mime: 'application/json; charset=utf-8' }
};

const server = createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/' || urlPath === '/original') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(await readFile(legacyHtmlPath));
    return;
  }

  const mapped = ALLOWED_STATIC[urlPath];
  if (mapped) {
    const abs = path.join(rootDir, mapped.file);
    if (existsSync(abs)) {
      res.writeHead(200, {
        'Content-Type': mapped.mime,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(await readFile(abs));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Não encontrado');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Visualização LOCAL ativa em http://127.0.0.1:${port}`);
  console.log(` - HTML Original (Pacote 01): http://127.0.0.1:${port}/`);
  console.log(` - Produtor Integrado:        http://127.0.0.1:${port}/produtor.html`);
  console.log(` - Financeiro Integrado:      http://127.0.0.1:${port}/financeiro.html`);
  console.log(` - Portal de Entrada:         http://127.0.0.1:${port}/portal`);
});
