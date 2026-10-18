/**
 * Template de Domínio Puro — Módulo Financeiro (_template)
 * Regras:
 * 1. Funções 100% puras (sem I/O, sem Firebase, sem DOM).
 * 2. Arredondamento financeiro padrão em 2 casas decimais.
 * 3. Se o módulo gerar visão para o produtor, implemente `projeccaoProdutor` sem vazar taxas do Disk.
 */

'use strict';

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function calcularModuloTemplate(registro = {}, parametros = {}) {
  const valorBase = round2(registro.valorBase || 0);
  const aliquotaPct = round2(parametros.aliquotaPct || 0);
  const valorCalculado = round2(valorBase * (aliquotaPct / 100));
  const valorLiquido = round2(Math.max(0, valorBase - valorCalculado));

  return {
    id: registro.id || null,
    eventoId: registro.eventoId || null,
    produtoraId: registro.produtoraId || null,
    valorBase,
    aliquotaPct,
    valorCalculado,
    valorLiquido
  };
}

function projecaoProdutorTemplate(calculo = {}) {
  return {
    id: calculo.id || null,
    eventoId: calculo.eventoId || null,
    valorLiquido: round2(calculo.valorLiquido || 0)
  };
}

module.exports = {
  calcularModuloTemplate,
  projecaoProdutorTemplate
};
