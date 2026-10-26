/**
 * Domínio Puro (em centavos) — Módulo Contratos Comerciais (comercial/contratos)
 */
'use strict';

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function calcularContratos(registro = {}) {
  const valorBaseCents = toCents(registro.valorBase || registro.valor || registro.garantiaMinima || 0);
  const abatimentoCents = toCents(registro.abatimento || 0);
  const liquidoCents = Math.max(0, valorBaseCents - abatimentoCents);

  return {
    id: registro.id || null,
    produtoraId: registro.produtoraId || null,
    eventoId: registro.eventoId || null,
    numeroContrato: registro.numeroContrato || null,
    valorBaseCents,
    valorBase: fromCents(valorBaseCents),
    abatimentoCents,
    abatimento: fromCents(abatimentoCents),
    valorLiquidoCents: liquidoCents,
    valorLiquido: fromCents(liquidoCents),
    vigenciaInicio: registro.vigenciaInicio || null,
    vigenciaFim: registro.vigenciaFim || null,
    status: registro.status || 'Pendente'
  };
}

function validarVigenciaContrato(contrato = {}, dataRefISO = '2026-10-26') {
  const assinado = Boolean(contrato.assinadoProdutor && contrato.assinadoComercial);
  const inicio = String(contrato.vigenciaInicio || '');
  const fim = String(contrato.vigenciaFim || '');
  const dentroPrazo = (!inicio || dataRefISO >= inicio) && (!fim || dataRefISO <= fim);
  const vigente = assinado && dentroPrazo && contrato.status !== 'Rescindido';

  return {
    id: contrato.id || null,
    produtoraId: contrato.produtoraId || null,
    assinado,
    dentroPrazo,
    vigente,
    statusCalculado: contrato.status === 'Rescindido'
      ? 'Rescindido'
      : vigente
      ? 'Vigente'
      : !dentroPrazo && fim && dataRefISO > fim
      ? 'Expirado'
      : 'AguardandoAssinatura'
  };
}

module.exports = {
  calcularContratos,
  validarVigenciaContrato
};
