/**
 * Domínio Puro (em centavos) — Módulo Conciliação Bancária e Adquirência (financeiro/conciliacao)
 */
'use strict';

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function calcularConciliacao(registro = {}) {
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
 * Concilia linhas do extrato bancário contra lançamentos do Ledger (/lancamentos) em centavos inteiros.
 */
function conciliarExtratoBancario({ itensExtrato = [], lancamentosLedger = [] } = {}) {
  const extratoList = Array.isArray(itensExtrato) ? itensExtrato : Object.values(itensExtrato || {});
  const ledgerList = Array.isArray(lancamentosLedger) ? lancamentosLedger : Object.values(lancamentosLedger || {});

  const conciliados = [];
  const divergentesValor = [];
  const pendentesExtrato = [];
  const ledgerUsadosIds = new Set();

  for (const item of extratoList) {
    const proto = String(item.protocolo || item.documento || '').trim();
    const valorExtCents = toCents(item.valorCents !== undefined ? fromCents(item.valorCents) : item.valor || 0);

    const candidato = ledgerList.find(l => {
      if (!l || ledgerUsadosIds.has(l.id)) return false;
      const hist = String(l.historico || '');
      const origId = String(l.origemId || '');
      return proto && (hist.includes(proto) || origId === proto || l.protocoloBancario === proto);
    });

    if (!candidato) {
      pendentesExtrato.push({ ...item, valorCents: valorExtCents, valor: fromCents(valorExtCents) });
      continue;
    }

    ledgerUsadosIds.add(candidato.id);
    const valorLedgerCents = candidato.valorCents !== undefined ? Number(candidato.valorCents) : toCents(candidato.valor || 0);
    const diffCents = valorExtCents - valorLedgerCents;

    if (diffCents === 0) {
      conciliados.push({
        protocolo: proto,
        extratoId: item.id || null,
        lancamentoId: candidato.id,
        valorCents: valorExtCents,
        valor: fromCents(valorExtCents)
      });
    } else {
      divergentesValor.push({
        protocolo: proto,
        extratoId: item.id || null,
        lancamentoId: candidato.id,
        valorExtratoCents: valorExtCents,
        valorLedgerCents,
        diferencaCents: diffCents,
        diferenca: fromCents(diffCents)
      });
    }
  }

  const pendentesLedger = ledgerList.filter(l => l && !ledgerUsadosIds.has(l.id));
  const somaExtratoCents = extratoList.reduce((acc, i) => acc + toCents(i.valor || 0), 0);
  const somaLedgerCents = ledgerList.reduce((acc, l) => acc + (l.valorCents !== undefined ? Number(l.valorCents) : toCents(l.valor || 0)), 0);

  return {
    conciliados,
    divergentesValor,
    pendentesExtrato,
    pendentesLedger,
    somaExtratoCents,
    somaExtrato: fromCents(somaExtratoCents),
    somaLedgerCents,
    somaLedger: fromCents(somaLedgerCents),
    diferencaTotalCents: somaExtratoCents - somaLedgerCents,
    diferencaTotal: fromCents(somaExtratoCents - somaLedgerCents),
    conciliadoComSucesso: divergentesValor.length === 0 && pendentesExtrato.length === 0 && pendentesLedger.length === 0
  };
}

module.exports = {
  calcularConciliacao,
  conciliarExtratoBancario
};
