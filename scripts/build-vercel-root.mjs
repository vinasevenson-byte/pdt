#!/usr/bin/env node
/**
 * Empacota os builds de `@diskingressos/app-financeiro` e `@diskingressos/app-produtor`
 * em `dist/` (e `public/`) na raiz do monorepo para deploy unificado na Vercel.
 *
 * Rotas geradas:
 *   /                 -> Hub de seleção (Painel do Financeiro / Portal do Produtor)
 *   /financeiro.html  -> App React/Vite do Painel do Financeiro
 *   /financeiro/      -> App React/Vite do Painel do Financeiro
 *   /produtor.html    -> App React/Vite do Portal do Produtor
 *   /produtor/        -> App React/Vite do Portal do Produtor
 *   /assets/*         -> Bundles JS/CSS de ambos os apps
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const finDist = path.join(ROOT_DIR, 'apps/financeiro/dist');
const prodDist = path.join(ROOT_DIR, 'apps/produtor/dist');
const rootIndex = path.join(ROOT_DIR, 'index.html');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function populateOutputDir(outDir) {
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'financeiro'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'produtor'), { recursive: true });

  // 1. Copia assets do Financeiro e do Produtor
  copyRecursive(path.join(finDist, 'assets'), path.join(outDir, 'assets'));
  copyRecursive(path.join(prodDist, 'assets'), path.join(outDir, 'assets'));

  // 2. Copia HTML compilado do Financeiro para /financeiro.html e /financeiro/index.html
  const finHtml = path.join(finDist, 'index.html');
  if (fs.existsSync(finHtml)) {
    fs.copyFileSync(finHtml, path.join(outDir, 'financeiro.html'));
    fs.copyFileSync(finHtml, path.join(outDir, 'financeiro/index.html'));
  }

  // 3. Copia HTML compilado do Produtor para /produtor.html e /produtor/index.html
  const prodHtml = path.join(prodDist, 'index.html');
  if (fs.existsSync(prodHtml)) {
    fs.copyFileSync(prodHtml, path.join(outDir, 'produtor.html'));
    fs.copyFileSync(prodHtml, path.join(outDir, 'produtor/index.html'));
  }

  // 4. Copia index.html do Hub para a raiz do output
  if (fs.existsSync(rootIndex)) {
    fs.copyFileSync(rootIndex, path.join(outDir, 'index.html'));
  } else if (fs.existsSync(finHtml)) {
    fs.copyFileSync(finHtml, path.join(outDir, 'index.html'));
  }
}

populateOutputDir(path.join(ROOT_DIR, 'dist'));
populateOutputDir(path.join(ROOT_DIR, 'public'));

console.log('✅ Build unificado da raiz gerado em dist/ e public/ (index.html, financeiro.html, produtor.html e assets/).');
