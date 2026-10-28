/**
 * Domínio Puro (em centavos) — Módulo BI Executivo e DRE Gerencial (plataforma/bi_executivo)
 * - Calcula GMV / Bilheteria Bruta, Ticket Médio, Receita Bruta Disk (Taxa Adm + Taxa Op + Conveniência + Tarifas TED),
 *   Deduções Comerciais (Rebate + Patrocínio), Receita Líquida Disk e Take Rate Líquido (%)
 * - Consolida Passivo de Repasses com Produtores (Liberável, Retido pelas Travas, Já Repassado)
 * - Consolida Posição de Tesouraria (Contas a Receber e Contas a Pagar)
 */
'use strict';

const crypto = require('node:crypto');
const { calcEvento } = require('../../../../packages/motor-repasse/src/index.js');

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function round2(v) {
  return fromCents(toCents(v));
}

function calcularDreExecutivoERP(contexto = {}) {
  const {
    produtoras = {},
    locais = {},
    eventos = {},
    eventosFin = {},
    negociacoes = {},
    despesas = {},
    advanced = {},
    antecipacoes = {},
    repasses = {},
    contasPagar = {},
    contasReceber = {}
  } = contexto;

  const despesasList = Object.values(despesas || {});
  const advancedList = Object.values(advanced || {});
  const antecipacoesList = Object.values(antecipacoes || {});
  const repassesList = Object.values(repasses || {});

  let gmvBilheteriaBrutaCents = 0;
  let totalIngressosVendidos = 0;
  let totalCortesias = 0;

  let receitaTaxaAdmBrutaCents = 0;
  let receitaTaxaOpCents = 0;
  let receitaConvenienciaCents = 0;
  let deducaoRebateCents = 0;
  let deducaoPatrocinioEventosCents = 0;

  let liberavelTotalCents = 0;
  let retidoTotalCents = 0;
  let jaRepassadoTotalCents = 0;

  const kpisPorEvento = [];

  for (const [evId, evData] of Object.entries(eventos || {})) {
    if (!evData || evData.ativo === false) continue;
    const fin = eventosFin[evId] || {};
    const neg = negociacoes[evId] || {};
    const loc = locais[evData.localId] || {};
    const despEv = despesasList.filter(d => d && d.eventoId === evId);
    const advEv = advancedList.filter(a => a && a.escopo === evId);
    const antEv = antecipacoesList.filter(a => a && a.eventoId === evId);

    const calc = calcEvento({ id: evId, ...evData }, fin, neg, despEv, advEv, antEv, loc);

    const bilCents = toCents(calc.bil || 0);
    const vend = Number(calc.vendidos || 0);
    const cort = Number(calc.cortesias || 0);
    const tAdmCents = toCents(calc.taxaAdm ?? calc.vTaxaAdm ?? 0);
    const tOpCents = toCents(calc.taxaOp ?? calc.vTaxaOp ?? 0);
    const convPct = Number((neg && neg.conveniencia && neg.conveniencia.percentual) || 0);
    const convCents = calc.vConv !== undefined ? toCents(calc.vConv) : Math.round((bilCents * convPct) / 100);
    const rebCents = toCents(calc.rebate || 0);
    const patEvCents = toCents(calc.patrocinio || 0);

    gmvBilheteriaBrutaCents += bilCents;
    totalIngressosVendidos += vend;
    totalCortesias += cort;

    receitaTaxaAdmBrutaCents += tAdmCents;
    receitaTaxaOpCents += tOpCents;
    receitaConvenienciaCents += convCents;
    deducaoRebateCents += rebCents;
    deducaoPatrocinioEventosCents += patEvCents;

    liberavelTotalCents += toCents(calc.liberavel || 0);
    retidoTotalCents += toCents(calc.retido || 0);
    jaRepassadoTotalCents += toCents(calc.jaRepassado || 0);

    kpisPorEvento.push({
      eventoId: evId,
      nome: evData.nome || evId,
      produtoraId: evData.produtoraId,
      vendidos: vend,
      cortesias: cort,
      pctVendido: calc.pctVendido,
      bilheteriaBruta: fromCents(bilCents),
      liberavel: calc.liberavel,
      retido: calc.retido,
      jaRepassado: calc.jaRepassado
    });
  }

  let deducaoPatrocinioProdutorasCents = 0;
  for (const prod of Object.values(produtoras || {})) {
    if (prod && prod.ativo !== false && prod.patrocinio && prod.patrocinio.ativo) {
      deducaoPatrocinioProdutorasCents += toCents(prod.patrocinio.valor || 0);
    }
  }

  const receitaTarifasTedCents = repassesList
    .filter(r => r && (r.status === 'Aprovado' || r.status === 'Pago'))
    .reduce((acc, r) => acc + toCents(r.tarifaTransferencia || 0), 0);

  const receitaBrutaDiskCents =
    receitaTaxaAdmBrutaCents + receitaTaxaOpCents + receitaConvenienciaCents + receitaTarifasTedCents;
  const totalDeducoesComerciaisCents =
    deducaoRebateCents + deducaoPatrocinioEventosCents + deducaoPatrocinioProdutorasCents;
  const receitaLiquidaDiskCents = Math.max(0, receitaBrutaDiskCents - totalDeducoesComerciaisCents);

  const takeRateLiquidoPct =
    gmvBilheteriaBrutaCents > 0 ? round2((receitaLiquidaDiskCents / gmvBilheteriaBrutaCents) * 100) : 0;
  const ticketMedioCents =
    totalIngressosVendidos > 0 ? Math.round(gmvBilheteriaBrutaCents / totalIngressosVendidos) : 0;

  let contasReceberPrevistoCents = 0;
  let contasReceberRecebidoCents = 0;
  for (const cr of Object.values(contasReceber || {})) {
    if (!cr || cr.status === 'Cancelado') continue;
    const v = toCents(cr.valor ?? cr.valorOriginal ?? 0);
    if (cr.status === 'Recebido' || cr.status === 'Baixado') contasReceberRecebidoCents += v;
    else contasReceberPrevistoCents += v;
  }

  let contasPagarPendenteCents = 0;
  let contasPagarPagoCents = 0;
  for (const cp of Object.values(contasPagar || {})) {
    if (!cp || cp.status === 'Cancelada' || cp.status === 'Cancelado') continue;
    const v = toCents(cp.valor ?? cp.valorOriginal ?? 0);
    if (cp.status === 'Paga' || cp.status === 'Pago') contasPagarPagoCents += v;
    else contasPagarPendenteCents += v;
  }

  const canonic = JSON.stringify({
    gmvBilheteriaBrutaCents,
    totalIngressosVendidos,
    receitaBrutaDiskCents,
    totalDeducoesComerciaisCents,
    receitaLiquidaDiskCents,
    liberavelTotalCents,
    retidoTotalCents,
    jaRepassadoTotalCents
  });
  const seloDreSha256 = crypto.createHash('sha256').update(canonic).digest('hex');

  return {
    gmvBilheteriaBrutaCents,
    gmvBilheteriaBruta: fromCents(gmvBilheteriaBrutaCents),
    totalIngressosVendidos,
    totalCortesias,
    ticketMedioCents,
    ticketMedio: fromCents(ticketMedioCents),
    dreDisk: {
      receitaTaxaAdmBrutaCents,
      receitaTaxaAdmBruta: fromCents(receitaTaxaAdmBrutaCents),
      receitaTaxaOpCents,
      receitaTaxaOp: fromCents(receitaTaxaOpCents),
      receitaConvenienciaCents,
      receitaConveniencia: fromCents(receitaConvenienciaCents),
      receitaTarifasTedCents,
      receitaTarifasTed: fromCents(receitaTarifasTedCents),
      receitaBrutaDiskCents,
      receitaBrutaDisk: fromCents(receitaBrutaDiskCents),
      deducaoRebateCents,
      deducaoRebate: fromCents(deducaoRebateCents),
      deducaoPatrocinioCents: deducaoPatrocinioEventosCents + deducaoPatrocinioProdutorasCents,
      deducaoPatrocinio: fromCents(deducaoPatrocinioEventosCents + deducaoPatrocinioProdutorasCents),
      totalDeducoesComerciaisCents,
      totalDeducoesComerciais: fromCents(totalDeducoesComerciaisCents),
      receitaLiquidaDiskCents,
      receitaLiquidaDisk: fromCents(receitaLiquidaDiskCents),
      takeRateLiquidoPct
    },
    passivoProdutores: {
      liberavelTotalCents,
      liberavelTotal: fromCents(liberavelTotalCents),
      retidoTotalCents,
      retidoTotal: fromCents(retidoTotalCents),
      jaRepassadoTotalCents,
      jaRepassadoTotal: fromCents(jaRepassadoTotalCents)
    },
    tesouraria: {
      contasReceberPrevistoCents,
      contasReceberPrevisto: fromCents(contasReceberPrevistoCents),
      contasReceberRecebidoCents,
      contasReceberRecebido: fromCents(contasReceberRecebidoCents),
      contasPagarPendenteCents,
      contasPagarPendente: fromCents(contasPagarPendenteCents),
      contasPagarPagoCents,
      contasPagarPago: fromCents(contasPagarPagoCents)
    },
    kpisPorEvento,
    seloDreSha256
  };
}

module.exports = {
  calcularDreExecutivoERP
};
