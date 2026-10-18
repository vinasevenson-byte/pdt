/**
 * Aritmética Monetária Exata em Centavos Inteiros (evita erro de ponto flutuante IEEE 754)
 */

'use strict';

function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v == null ? '' : v).trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function toCents(valorReais) {
  return Math.round((toNum(valorReais) + Number.EPSILON) * 100);
}

function fromCents(valorCents) {
  return Math.round(Number(valorCents || 0)) / 100;
}

function round2(valorReais) {
  return fromCents(toCents(valorReais));
}

function addMoney(...valoresReais) {
  const totalCents = valoresReais.reduce((acc, v) => acc + toCents(v), 0);
  return fromCents(totalCents);
}

function subMoney(aReais, bReais) {
  return fromCents(toCents(aReais) - toCents(bReais));
}

function mulPct(valorReais, percentual) {
  const cents = toCents(valorReais);
  const pct = toNum(percentual);
  return fromCents(Math.round((cents * pct) / 100));
}

module.exports = {
  toNum,
  toCents,
  fromCents,
  round2,
  addMoney,
  subMoney,
  mulPct
};
