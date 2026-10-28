import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { calcularDreExecutivoERP } = require('../domain/index.js');
const seed = JSON.parse(readFileSync(path.resolve('firebase/seed.json'), 'utf8'));

test('plataforma/bi_executivo — cálculo de GMV, DRE Disk, Take Rate e passivo com produtores sobre o seed', () => {
  const dre = calcularDreExecutivoERP({
    produtoras: seed.produtoras,
    locais: seed.locais,
    eventos: seed.eventos,
    eventosFin: seed.eventos_fin,
    negociacoes: seed.negociacoes,
    despesas: seed.despesas,
    advanced: seed.advanced,
    antecipacoes: seed.antecipacoes,
    repasses: seed.repasses
  });

  // Bilheteria bruta do seed: Polaquedo (6000) + Festival (72000) + Stand-up (3600) = 81600
  assert.equal(dre.gmvBilheteriaBruta, 81600);
  assert.equal(dre.totalIngressosVendidos, 150 + 720 + 60);
  assert.ok(dre.dreDisk.receitaBrutaDiskCents > 0);
  assert.ok(dre.dreDisk.receitaLiquidaDiskCents > 0);
  assert.equal(dre.seloDreSha256.length, 64);
});
