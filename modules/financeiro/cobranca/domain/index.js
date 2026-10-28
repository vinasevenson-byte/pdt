/**
 * Domínio Puro (em centavos) — Módulo Cobrança, Inadimplência e Devedores (financeiro/cobranca)
 * - Identifica eventos deficitários (`saldoDevedor > 0`) de uma produtora
 * - Calcula compensação cruzada automática contra o saldo liberável de outros eventos da mesma produtora
 * - Apura a dívida líquida residual (`dividaResidualCents`) e gera título de recomposição em `/contas_receber`
 */
'use strict';

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function apurarPosicaoDevedoraProdutora({ produtoraId, eventosCalculados = [] }) {
  if (!produtoraId) {
    throw new Error('produtoraId é obrigatório para apurar posição devedora.');
  }

  const eventosDevedores = [];
  const eventosSuperavitarios = [];
  let totalDevedorBrutoCents = 0;
  let totalLiberavelSuperavitCents = 0;

  for (const ev of eventosCalculados) {
    if (!ev) continue;
    const devCents = toCents(ev.saldoDevedor || 0);
    const libCents = toCents(ev.liberavel || 0);
    if (devCents > 0) {
      totalDevedorBrutoCents += devCents;
      eventosDevedores.push({
        eventoId: ev.id,
        nome: ev.nome || ev.id,
        saldoDevedorCents: devCents,
        saldoDevedor: fromCents(devCents)
      });
    } else if (libCents > 0) {
      totalLiberavelSuperavitCents += libCents;
      eventosSuperavitarios.push({
        eventoId: ev.id,
        nome: ev.nome || ev.id,
        liberavelCents: libCents,
        liberavel: fromCents(libCents)
      });
    }
  }

  const compensadoEntreEventosCents = Math.min(totalDevedorBrutoCents, totalLiberavelSuperavitCents);
  const dividaResidualCents = Math.max(0, totalDevedorBrutoCents - compensadoEntreEventosCents);
  const status =
    totalDevedorBrutoCents === 0
      ? 'Adimplente'
      : dividaResidualCents === 0
      ? 'CompensadoAutomaticamente'
      : 'EmCobrancaResidual';

  return {
    id: `cob_${produtoraId}`,
    produtoraId,
    status,
    possuiDevedor: totalDevedorBrutoCents > 0,
    totalDevedorBrutoCents,
    totalDevedorBruto: fromCents(totalDevedorBrutoCents),
    totalLiberavelSuperavitCents,
    totalLiberavelSuperavit: fromCents(totalLiberavelSuperavitCents),
    compensadoEntreEventosCents,
    compensadoEntreEventos: fromCents(compensadoEntreEventosCents),
    dividaResidualCents,
    dividaResidual: fromCents(dividaResidualCents),
    eventosDevedores,
    eventosSuperavitarios
  };
}

module.exports = {
  apurarPosicaoDevedoraProdutora
};
