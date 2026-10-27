/**
 * Domínio Puro (em centavos) — Módulo Fiscal e Retenções por Competência (financeiro/fiscal)
 * - Apuração de ISS, PIS, COFINS, IRPJ e CSLL sobre receitas de intermediação Disk
 * - Consolidação de retenções de eventos sob responsabilidade da Disk (ISS, ECAD, etc.)
 * - Reconciliação com a conta contábil 2.1.01.002 - Retenções de Eventos a Recolher e selo SHA-256
 */
'use strict';

const crypto = require('node:crypto');
const {
  calcEvento,
  PLANO_CONTAS,
  extrairCompetencia
} = require('../../../../packages/motor-repasse/src/index.js');

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function mulPctCents(baseCents, pct) {
  return Math.round((Number(baseCents || 0) * Number(pct || 0)) / 100);
}

const ALIQUOTAS_FISCAIS_PADRAO = Object.freeze({
  issPct: 5.0,
  pisPct: 0.65,
  cofinsPct: 3.0,
  irpjPct: 4.8,
  csllPct: 2.88
});

function calcularFiscal(registro = {}) {
  const valorBaseCents = toCents(registro.valorBase || registro.valor || 0);
  const abatimentoCents = toCents(registro.abatimento || 0);
  const liquidoCents = Math.max(0, valorBaseCents - abatimentoCents);

  return {
    id: registro.id || null,
    produtoraId: registro.produtoraId || null,
    eventoId: registro.eventoId || null,
    valorBaseCents,
    valorBase: fromCents(valorBaseCents),
    abatimentoCents,
    abatimento: fromCents(abatimentoCents),
    valorLiquidoCents: liquidoCents,
    valorLiquido: fromCents(liquidoCents),
    status: registro.status || 'Pendente'
  };
}

/**
 * Calcula a apuração fiscal de uma competência (YYYY-MM) em centavos inteiros.
 */
function calcularApuracaoFiscalCompetencia({
  competencia,
  eventos = {},
  eventosFin = {},
  negociacoes = {},
  despesas = {},
  locais = {},
  lancamentos = {},
  aliquotas = {}
} = {}) {
  if (!competencia || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(competencia).trim())) {
    throw new Error('Informe uma competência válida no formato YYYY-MM.');
  }

  const aliq = {
    ...ALIQUOTAS_FISCAIS_PADRAO,
    ...(aliquotas || {})
  };

  const listaDespesas = Array.isArray(despesas) ? despesas : Object.values(despesas || {});
  const eventosEntries = Array.isArray(eventos)
    ? eventos.map((e, i) => [e.id || `ev_${i}`, e])
    : Object.entries(eventos || {});

  let receitaTaxasEventosCents = 0;
  let totalRetencoesEventosCents = 0;
  const retencoesPorNomeMap = new Map();
  const apuracaoPorEvento = [];

  for (const [evKey, ev] of eventosEntries) {
    if (!ev || typeof ev !== 'object') continue;
    const evId = String(ev.id || evKey);
    const compEv = ev.competencia || extrairCompetencia(ev.data || '');
    if (compEv && compEv !== competencia) continue;

    const fin = (eventosFin && eventosFin[evId]) || {};
    const neg = (negociacoes && negociacoes[evId]) || {};
    const despEv = listaDespesas.filter(d => d && d.eventoId === evId);
    const loc = (locais && ev.localId && locais[ev.localId]) || {};

    const calc = calcEvento({ id: evId, ...ev }, fin, neg, despEv, [], [], loc);
    const recDiskEvCents = toCents(calc.receitaDiskLiquida || 0);
    const retEvCents = toCents(calc.totRetencoes || 0);

    receitaTaxasEventosCents += recDiskEvCents;
    totalRetencoesEventosCents += retEvCents;

    for (const r of calc.retencoesDetalhe || []) {
      if (!r.descontaDoRepasse) continue;
      const rCents = toCents(r.valor || 0);
      const chave = String(r.nome || r.id || 'Retenção');
      retencoesPorNomeMap.set(chave, (retencoesPorNomeMap.get(chave) || 0) + rCents);
    }

    apuracaoPorEvento.push({
      eventoId: evId,
      nome: ev.nome || evId,
      produtoraId: ev.produtoraId || null,
      bilheteriaCents: toCents(calc.bil || 0),
      receitaDiskLiquidaCents: recDiskEvCents,
      receitaDiskLiquida: fromCents(recDiskEvCents),
      retencoesProvisionadasCents: retEvCents,
      retencoesProvisionadas: fromCents(retEvCents)
    });
  }

  // Receitas contabilizadas no Ledger na competência (tarifas de transferência e encargos de antecipação)
  const listaLanc = Array.isArray(lancamentos) ? lancamentos : Object.values(lancamentos || {});
  const lancsComp = listaLanc.filter(
    l => l && (l.competencia || extrairCompetencia(l.data)) === competencia
  );

  let receitasFinanceirasLedgerCents = 0;
  let creditosContaRetencoesCents = 0;
  let debitosContaRetencoesCents = 0;

  for (const l of lancsComp) {
    const cents = l.valorCents !== undefined ? Math.round(Number(l.valorCents)) : toCents(l.valor || 0);
    if (
      l.contaCredito === PLANO_CONTAS.RECEITA_TARIFA_TRANSFERENCIA ||
      l.contaCredito === PLANO_CONTAS.RECEITA_ENCARGOS_ANTECIPACAO
    ) {
      receitasFinanceirasLedgerCents += cents;
    }
    if (
      l.contaDebito === PLANO_CONTAS.RECEITA_TARIFA_TRANSFERENCIA ||
      l.contaDebito === PLANO_CONTAS.RECEITA_ENCARGOS_ANTECIPACAO
    ) {
      receitasFinanceirasLedgerCents = Math.max(0, receitasFinanceirasLedgerCents - cents);
    }

    if (l.contaCredito === PLANO_CONTAS.OBRIGACOES_RETENCOES_RECOLHER) {
      creditosContaRetencoesCents += cents;
    }
    if (l.contaDebito === PLANO_CONTAS.OBRIGACOES_RETENCOES_RECOLHER) {
      debitosContaRetencoesCents += cents;
    }
  }

  const baseTributavelDiskCents = receitaTaxasEventosCents + receitasFinanceirasLedgerCents;
  const issProprioCents = mulPctCents(baseTributavelDiskCents, aliq.issPct);
  const pisCents = mulPctCents(baseTributavelDiskCents, aliq.pisPct);
  const cofinsCents = mulPctCents(baseTributavelDiskCents, aliq.cofinsPct);
  const irpjCents = mulPctCents(baseTributavelDiskCents, aliq.irpjPct);
  const csllCents = mulPctCents(baseTributavelDiskCents, aliq.csllPct);

  const totalTributosPropriosCents =
    issProprioCents + pisCents + cofinsCents + irpjCents + csllCents;

  const retencoesPorTipo = Array.from(retencoesPorNomeMap.entries()).map(([nome, valorCents]) => ({
    nome,
    valorCents,
    valor: fromCents(valorCents)
  }));

  const retencoesJaRecolhidasNoLedgerCents = debitosContaRetencoesCents;
  const retencoesARecolherCents = Math.max(
    0,
    totalRetencoesEventosCents - retencoesJaRecolhidasNoLedgerCents
  );
  const totalGuiasARecolherCents = totalTributosPropriosCents + retencoesARecolherCents;

  const seloApuracaoSha256 = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        competencia,
        baseTributavelDiskCents,
        totalTributosPropriosCents,
        totalRetencoesEventosCents,
        retencoesARecolherCents
      }),
      'utf8'
    )
    .digest('hex');

  return {
    competencia,
    aliquotasAplicadas: aliq,
    baseTributavelDiskCents,
    baseTributavelDisk: fromCents(baseTributavelDiskCents),
    tributosProprios: {
      issCents: issProprioCents,
      iss: fromCents(issProprioCents),
      pisCents,
      pis: fromCents(pisCents),
      cofinsCents,
      cofins: fromCents(cofinsCents),
      irpjCents,
      irpj: fromCents(irpjCents),
      csllCents,
      csll: fromCents(csllCents),
      totalCents: totalTributosPropriosCents,
      total: fromCents(totalTributosPropriosCents)
    },
    retencoesTerceiros: {
      totalProvisionadoEventosCents: totalRetencoesEventosCents,
      totalProvisionadoEventos: fromCents(totalRetencoesEventosCents),
      jaRecolhidoLedgerCents: retencoesJaRecolhidasNoLedgerCents,
      jaRecolhidoLedger: fromCents(retencoesJaRecolhidasNoLedgerCents),
      saldoARecolherCents: retencoesARecolherCents,
      saldoARecolher: fromCents(retencoesARecolherCents),
      porTipo: retencoesPorTipo
    },
    totalGuiasARecolherCents,
    totalGuiasARecolher: fromCents(totalGuiasARecolherCents),
    eventosApurados: apuracaoPorEvento,
    seloApuracaoSha256
  };
}

module.exports = {
  ALIQUOTAS_FISCAIS_PADRAO,
  calcularFiscal,
  calcularApuracaoFiscalCompetencia
};
