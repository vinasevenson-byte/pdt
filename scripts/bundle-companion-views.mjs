#!/usr/bin/env node
/**
 * Garante que o deploy isolado de `Portal_Produtor_DiskIngressos` (ex: pdt-omega.vercel.app)
 * ou de `Financeiro_DiskIngressos` inclua tanto `/financeiro.html` quanto `/produtor.html`
 * (e seus respectivos assets em `/assets/*`) dentro do `dist/` publicado na Vercel.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const mode = process.argv[2] || 'produtor'; // 'produtor' | 'financeiro'

const currentDir =
  mode === 'produtor'
    ? path.join(ROOT_DIR, 'Portal_Produtor_DiskIngressos')
    : path.join(ROOT_DIR, 'Financeiro_DiskIngressos');

const companionDir =
  mode === 'produtor'
    ? path.join(ROOT_DIR, 'Financeiro_DiskIngressos')
    : path.join(ROOT_DIR, 'Portal_Produtor_DiskIngressos');

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

const currentNodeModules = fs.existsSync(path.join(currentDir, 'node_modules'))
  ? path.join(currentDir, 'node_modules')
  : path.join(ROOT_DIR, 'node_modules');

const companionNodeModules = path.join(companionDir, 'node_modules');
let createdSymlink = false;

try {
  if (!fs.existsSync(companionNodeModules) && fs.existsSync(currentNodeModules)) {
    fs.symlinkSync(currentNodeModules, companionNodeModules, 'junction');
    createdSymlink = true;
  }

  const viteBin = path.join(currentNodeModules, 'vite/bin/vite.js');
  if (fs.existsSync(viteBin)) {
    console.log(`🔨 Compilando visão complementar em ${path.basename(companionDir)}...`);
    execFileSync(process.execPath, [viteBin, 'build'], {
      cwd: companionDir,
      stdio: 'inherit'
    });
  }

  const currentDist = path.join(currentDir, 'dist');
  const companionDist = path.join(companionDir, 'dist');

  fs.mkdirSync(path.join(currentDist, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(currentDist, 'financeiro'), { recursive: true });
  fs.mkdirSync(path.join(currentDist, 'produtor'), { recursive: true });

  // Copia assets da visão complementar para o dist atual
  copyRecursive(path.join(companionDist, 'assets'), path.join(currentDist, 'assets'));

  const finHtml =
    mode === 'financeiro'
      ? path.join(currentDist, 'index.html')
      : path.join(companionDist, 'index.html');

  const prodHtml =
    mode === 'produtor'
      ? path.join(currentDist, 'index.html')
      : path.join(companionDist, 'index.html');

  if (fs.existsSync(finHtml)) {
    fs.copyFileSync(finHtml, path.join(currentDist, 'financeiro.html'));
    fs.copyFileSync(finHtml, path.join(currentDist, 'financeiro/index.html'));
  }

  if (fs.existsSync(prodHtml)) {
    fs.copyFileSync(prodHtml, path.join(currentDist, 'produtor.html'));
    fs.copyFileSync(prodHtml, path.join(currentDist, 'produtor/index.html'));
  }

  console.log(`✅ Rotas /financeiro.html e /produtor.html integradas em ${path.relative(ROOT_DIR, currentDist)}/`);
} finally {
  if (createdSymlink) {
    try {
      fs.unlinkSync(companionNodeModules);
    } catch {
      fs.rmSync(companionNodeModules, { recursive: true, force: true });
    }
  }
}
