/**
 * Domínio Puro (em centavos) — Módulo Recebíveis de Gateway e Adquirente (financeiro/recebiveis)
 * - Calcula MDR (Merchant Discount Rate) e taxa de antecipação de adquirente em centavos inteiros
 * - Calcula data prevista de liquidação em dias úteis bancários (somarDiasUteis)
 * - Prepara baixa de /contas_receber e lançamentos em partida dobrada no Ledger (/lancamentos)
 */
'use strict';

const {
  somarDiasUteis,
  PLANO_CONTAS,
  criarLancamentoPartidaDobrada
} = require('../../../../packages/motor-repasse/src/index.js');

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function round2(v) {
  return fromCents(toCents(v));
}

function calcularLiquidacaoAdquirente(dados = {}, tituloReceber = {}) {
  const valorBrutoCents = toCents(
    tituloReceber.valorCents !== undefined
      ? fromCents(tituloReceber.valorCents)
      : (tituloReceber.valor ?? tituloReceber.valorOriginal ?? dados.valorBruto ?? 0)
  );
  if (valorBrutoCents <= 0) {
    throw new Error('O título a receber deve possuir valor bruto positivo.');
  }

  const taxaMdrPct = round2(dados.taxaMdrPct !== undefined ? dados.taxaMdrPct : 2.5);
  const taxaAntecipacaoPct = round2(dados.taxaAntecipacaoPct || 0);
  if (taxaMdrPct < 0 || taxaMdrPct >= 50) {
    throw new Error(`Percentual de MDR inválido (${taxaMdrPct}%).`);
  }
  if (taxaAntecipacaoPct < 0 || taxaAntecipacaoPct >= 50) {
    throw new Error(`Percentual de antecipação de adquirente inválido (${taxaAntecipacaoPct}%).`);
  }

  const descontoMdrCents = Math.round((valorBrutoCents * taxaMdrPct) / 100);
  const descontoAntecipacaoCents = Math.round((valorBrutoCents * taxaAntecipacaoPct) / 100);
  const totalDescontosGatewayCents = descontoMdrCents + descontoAntecipacaoCents;
  const valorLiquidoCents = Math.max(0, valorBrutoCents - totalDescontosGatewayCents);

  const dataBaseBR = String(dados.dataVendaBR || '27/10/2026');
  const prazoDiasUteis = Math.max(0, Math.round(Number(dados.prazoDiasUteis !== undefined ? dados.prazoDiasUteis : 1)));
  const dataPrevistaLiquidacao = somarDiasUteis(dataBaseBR, prazoDiasUteis);

  return {
    valorBrutoCents,
    valorBruto: fromCents(valorBrutoCents),
    taxaMdrPct,
    taxaAntecipacaoPct,
    descontoMdrCents,
    descontoMdr: fromCents(descontoMdrCents),
    descontoAntecipacaoCents,
    descontoAntecipacao: fromCents(descontoAntecipacaoCents),
    totalDescontosGatewayCents,
    totalDescontosGateway: fromCents(totalDescontosGatewayCents),
    valorLiquidoCents,
    valorLiquido: fromCents(valorLiquidoCents),
    dataPrevistaLiquidacao
  };
}

function gerarLancamentosLiquidacaoAdquirente({
  agendaId,
  tituloReceberId,
  produtoraId,
  eventoId,
  calculo,
  competencia,
  dataLiquidacao,
  usuario,
  protocoloAdquirente
}) {
  const lancamentos = {};

  // 1. Entrada líquida no banco contra baixa de Clientes/Adquirentes a Receber
  if (calculo.valorLiquidoCents > 0) {
    lancamentos[`lnc_rcb_${agendaId}`] = criarLancamentoPartidaDobrada({
      id: `lnc_rcb_${agendaId}`,
      competencia,
      dataLancamento: dataLiquidacao,
      origemModulo: 'RecebiveisAdquirente',
      origemId: tituloReceberId,
      produtoraId,
      eventoId,
      contaDebito: PLANO_CONTAS.BANCO_CONTA_MOVIMENTO,
      contaCredito: PLANO_CONTAS.CLIENTES_ADQUIRENTES_RECEBER,
      valorCents: calculo.valorLiquidoCents,
      historico: `Liquidação de adquirente (${protocoloAdquirente}) ref. título ${tituloReceberId}`,
      criadoPor: usuario
    });
  }

  // 2. Despesa de MDR / Taxa de Gateway contra baixa residual de Clientes/Adquirentes a Receber
  if (calculo.totalDescontosGatewayCents > 0) {
    lancamentos[`lnc_mdr_${agendaId}`] = criarLancamentoPartidaDobrada({
      id: `lnc_mdr_${agendaId}`,
      competencia,
      dataLancamento: dataLiquidacao,
      origemModulo: 'RecebiveisAdquirente',
      origemId: tituloReceberId,
      produtoraId,
      eventoId,
      contaDebito: PLANO_CONTAS.DESPESA_TARIFAS_BANCARIAS,
      contaCredito: PLANO_CONTAS.CLIENTES_ADQUIRENTES_RECEBER,
      valorCents: calculo.totalDescontosGatewayCents,
      historico: `Taxa MDR (${calculo.taxaMdrPct}%) + Antecipação (${calculo.taxaAntecipacaoPct}%) sobre ${tituloReceberId}`,
      criadoPor: usuario
    });
  }

  return lancamentos;
}

module.exports = {
  calcularLiquidacaoAdquirente,
  gerarLancamentosLiquidacaoAdquirente
};
