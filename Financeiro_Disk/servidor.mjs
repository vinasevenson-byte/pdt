import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';
const page = readFileSync(new URL('./index.html', import.meta.url));
const motorJs = readFileSync(new URL('./motorRepasse.js', import.meta.url));

createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/index.html' || url === '/Main.dc.html' || url === '/financeiro.html') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(page);
    return;
  }
  if (url === '/motorRepasse.js') {
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(motorJs);
    return;
  }
  if (url === '/produtor.html') {
    const reqHost = (req.headers.host || '127.0.0.1:5173').split(':')[0];
    res.writeHead(302, { Location: `http://${reqHost}:5174/` });
    res.end();
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Não encontrado');
}).listen(port, host, () => {
  console.log(`Financeiro Disk (interface original fiel) em http://localhost:${port} e na rede na porta ${port}`);
});
