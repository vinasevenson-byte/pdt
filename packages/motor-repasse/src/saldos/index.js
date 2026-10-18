/**
 * Motor de Saldo por Produtora (/saldos/{produtoraId}) e Projeção Limpa (/extrato_produtor/{produtoraId})
 * Consolida: retido, liberável, repassado, em antecipação e advanced em aberto.
 */

'use strict';

const { toCents, fromCents } = require('../shared/money');
const { calcAdvancedPosicao } = require('../advanced');

function calcSaldoProdutora({
  produtoraId,
  produtora = {},
  eventosCalculados = [],
  consolidado = {},
  repasses = [],
  antecipacoes = [],
  advanced = [],
  devolucoesAdvanced = []
}) {
  const listaEventos = Array.isArray(eventosCalculados) ? eventosCalculados : Object.values(eventosCalculados || {});
  const listaRepasses = Array.isArray(repasses) ? repasses : Object.values(repasses || {});
  const listaAntecipacoes = Array.isArray(antecipacoes) ? antecipacoes : Object.values(antecipacoes || {});

  const retidoTotalCents = listaEventos.reduce((acc, e) => acc + toCents(e.retido), 0);
  const liberavelEventosCents = listaEventos
    .filter(e => e.liberadoParaSolicitacao !== false)
    .reduce((acc, e) => acc + toCents(e.liberavel), 0);

  const repassadoEventosCents = listaEventos.reduce((acc, e) => acc + toCents(e.jaRepassado), 0);
  const repassesEmProcessamentoCents = listaRepasses
    .filter(r => r && (r.status === 'Solicitado' || r.status === 'Aprovado'))
    .reduce((acc, r) => acc + toCents(r.valorSolicitado), 0);

  const emAntecipacaoPrincipalCents = listaAntecipacoes
    .filter(a => a && a.abaterNoProximo && (a.status === 'Aprovada' || a.status === 'Paga'))
    .reduce((acc, a) => acc + toCents(a.valor), 0);

  const advPos = calcAdvancedPosicao(advanced, devolucoesAdvanced);
  const saldoDisponivelCents = toCents(
    consolidado.saldoDisponivel !== undefined ? consolidado.saldoDisponivel : fromCents(liberavelEventosCents)
  );

  return {
    produtoraId: produtoraId || produtora.id || null,
    retidoCents: retidoTotalCents,
    retido: fromCents(retidoTotalCents),
    liberavelEventosCents,
    liberavelEventos: fromCents(liberavelEventosCents),
    saldoDisponivelCents,
    saldoDisponivel: fromCents(saldoDisponivelCents),
    repassadoCents: repassadoEventosCents,
    repassado: fromCents(repassadoEventosCents),
    repassesEmProcessamentoCents,
    repassesEmProcessamento: fromCents(repassesEmProcessamentoCents),
    emAntecipacaoCents: emAntecipacaoPrincipalCents,
    emAntecipacao: fromCents(emAntecipacaoPrincipalCents),
    advancedEmAbertoCents: advPos.saldoAbertoCents,
    advancedEmAberto: advPos.saldoAberto
  };
}

/**
 * Monta a projeção limpa /extrato_produtor/{produtoraId} para leitura do produtor.
 * PROIBIDO conter chaves com "taxa", "adm", "op", "conveniencia" ou "spread".
 */
function extrato_produtor(saldoProdutora = {}, historicoRepasses = []) {
  const itens = (Array.isArray(historicoRepasses) ? historicoRepasses : Object.values(historicoRepasses || {})).map(r => ({
    id: r.id || null,
    data: r.pagoEm || r.decididoEm || r.solicitadoEm || '',
    forma: r.forma || 'PIX',
    status: r.status || 'Solicitado',
    valorSolicitado: fromCents(toCents(r.valorSolicitado)),
    tarifaTransferencia: fromCents(toCents(r.tarifaTransferencia)),
    valorLiquido: fromCents(toCents(r.valorLiquido))
  }));

  return {
    produtoraId: saldoProdutora.produtoraId || null,
    retido: fromCents(toCents(saldoProdutora.retido)),
    liberavelEventos: fromCents(toCents(saldoProdutora.liberavelEventos)),
    saldoDisponivel: fromCents(toCents(saldoProdutora.saldoDisponivel)),
    repassado: fromCents(toCents(saldoProdutora.repassado)),
    emAntecipacao: fromCents(toCents(saldoProdutora.emAntecipacao)),
    advancedEmAberto: fromCents(toCents(saldoProdutora.advancedEmAberto)),
    movimentacoes: itens
  };
}

module.exports = {
  calcSaldoProdutora,
  extrato_produtor
};
