/**
 * Testes Unitários e de Segurança — Novos Módulos Financeiros (Seção 5)
 * Ledger (/lancamentos), Contas a Pagar/Receber, Saldos, Extrato Produtor,
 * Advanced, Rebate, Spread e Fluxo de Caixa (30/60/90 dias).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  calcEvento,
  calcConsolidado,
  somarDiasUteis,
  toCents,
  fromCents,
  addMoney,
  subMoney,
  criarLancamentoPartidaDobrada,
  gerarEstornoLancamento,
  derivarStatusTitulo,
  gerarTitulosEvento,
  baixarTitulo,
  calcAdvancedPosicao,
  calcSaldoProdutora,
  extrato_produtor,
  calcRebate,
  calcSpreadOperacao,
  calcSpreadAntecipacoes,
  calcFluxoCaixa
} = require('../src/index.js');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'firebase/seed.json'), 'utf8'));
const rules = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'firebase/database.rules.json'), 'utf8'));

test('SEÇÃO 5.1 & 5.4 — Dinheiro em centavos inteiros e Ledger imutável (/lancamentos) com partida dobrada + bloqueio por /fechamentos', () => {
  assert.equal(toCents(192.53) + toCents(3863.47), 405600);
  assert.equal(addMoney(192.53, 3863.47), 4056.00);
  assert.equal(subMoney(4056.00, 192.53), 3863.47);

  const lanc = criarLancamentoPartidaDobrada({
    id: 'lanc_01',
    data: '15/10/2026',
    contaDebito: '2.1.01.001-Obrigacoes-Repasses',
    contaCredito: '1.1.01.001-Banco-Itau',
    valor: 4056.00,
    produtoraId: 'prod_exemplo',
    eventoId: 'festival',
    origemModulo: 'repasses',
    origemId: 'rep_1',
    historico: 'Liquidação de repasse aprovado'
  });

  assert.equal(lanc.competencia, '2026-10');
  assert.equal(lanc.valorCents, 405600);
  assert.equal(lanc.valor, 4056.00);
  assert.equal(lanc.imutavel, true);
  assert.equal(lanc.tipo, 'original');

  // Estorno deve gerar novo lançamento invertendo Débito e Crédito
  const estorno = gerarEstornoLancamento(lanc, {
    id: 'lanc_02',
    data: '16/10/2026',
    motivo: 'Devolução TED por agência incorreta',
    usuario: 'financeiro@diskingressos.com.br'
  });

  assert.equal(estorno.tipo, 'estorno');
  assert.equal(estorno.estornoDeId, 'lanc_01');
  assert.equal(estorno.contaDebito, lanc.contaCredito);
  assert.equal(estorno.contaCredito, lanc.contaDebito);
  assert.equal(estorno.valorCents, 405600);

  // Competência fechada em /fechamentos deve bloquear lançamento retroativo
  const fechamentos = {
    '2026-09': { fechado: true, status: 'Fechado' }
  };
  assert.throws(() => {
    criarLancamentoPartidaDobrada(
      {
        data: '25/09/2026',
        contaDebito: '1.1.01',
        contaCredito: '2.1.01',
        valor: 100
      },
      fechamentos
    );
  }, /encerrada em \/fechamentos/);
});

test('SEÇÃO 5.1 & 5.3 — Contas a Receber e Contas a Pagar: geração por evento, derivação de Vencida e baixa gerando Ledger', () => {
  const ev = { id: 'polaquedo', ...seed.eventos.polaquedo };
  const calc = calcEvento(
    ev,
    seed.eventos_fin.polaquedo,
    seed.negociacoes.polaquedo,
    Object.values(seed.despesas).filter(d => d.eventoId === 'polaquedo'),
    [],
    [],
    seed.locais[ev.localId]
  );

  const { contasReceber, contasPagar } = gerarTitulosEvento(ev, calc, '06/10/2026');
  assert.equal(contasReceber.length, 2); // Bilheteria (6000) + Taxas Disk (600)
  assert.ok(contasPagar.length >= 2);   // Repasse Produtor (240) + Retenções provisionadas (ISS, ECAD, Locação, Segurança)

  const tituloRepasse = contasPagar.find(t => t.categoria === 'Repasse Produtor');
  assert.equal(tituloRepasse.valorCents, 24000);
  assert.equal(derivarStatusTitulo(tituloRepasse, '05/10/2026'), 'Prevista');
  assert.equal(derivarStatusTitulo(tituloRepasse, '10/10/2026'), 'Vencida');

  // Baixa do título gera lançamento no Ledger e muda status para Paga
  const { tituloAtualizado, lancamento } = baixarTitulo(tituloRepasse, {
    lancamentoId: 'lanc_baixa_1',
    dataBaixa: '06/10/2026',
    usuario: 'financeiro@diskingressos.com.br'
  });

  assert.equal(tituloAtualizado.status, 'Paga');
  assert.equal(tituloAtualizado.valorBaixadoCents, 24000);
  assert.equal(lancamento.valorCents, 24000);
  assert.equal(lancamento.origemModulo, 'contas_pagar');
});

test('SEÇÃO 5.2 — Motores de Rebate (limitado à Taxa Adm líquida), Spread e Advanced', () => {
  // Rebate limitado à taxa adm restante
  const rebOk = calcRebate({
    bilheteria: 72000,
    taxaAdm: 3600,
    patrocinioJaAlocado: 2000,
    regraRebate: { ativo: true, tipo: 'percentual', valor: 1 }
  });
  assert.equal(rebOk.rebateBruto, 720);
  assert.equal(rebOk.rebateCreditado, 720);
  assert.equal(rebOk.excedenteBloqueado, 0);
  assert.equal(rebOk.taxaAdmRestante, 880);

  // Rebate que excede a taxa adm restante é bloqueado no teto
  const rebTeto = calcRebate({
    bilheteria: 72000,
    taxaAdm: 3600,
    patrocinioJaAlocado: 3000,
    regraRebate: { ativo: true, tipo: 'fixo', valor: 1000 }
  });
  assert.equal(rebTeto.rebateCreditado, 600);
  assert.equal(rebTeto.excedenteBloqueado, 400);
  assert.equal(rebTeto.taxaAdmRestante, 0);

  // Spread sobre antecipações (taxa 2% cobrada vs custo de captação 0.8%)
  const spreadRes = calcSpreadAntecipacoes(Object.values(seed.antecipacoes), 0.8);
  assert.equal(spreadRes.receitaTotal, 120.00); // 2% de 6000
  assert.equal(spreadRes.custoTotal, 48.00);    // 0.8% de 6000
  assert.equal(spreadRes.spreadTotal, 72.00);   // margem líquida Disk

  // Posição de Advanced
  const advPos = calcAdvancedPosicao(Object.values(seed.advanced));
  assert.equal(advPos.totalConcedido, 3500);
  assert.equal(advPos.abaterNoProximo, 2000);
  assert.equal(advPos.saldoAberto, 2000);
});

test('SEÇÃO 5.1 & 5.2 — Saldo por Produtora (/saldos) e Projeção Limpa (/extrato_produtor) + Fluxo de Caixa (30/60/90 dias)', () => {
  const cPol = { id: 'polaquedo', liberadoParaSolicitacao: true, ...calcEvento({ id: 'polaquedo', ...seed.eventos.polaquedo }, seed.eventos_fin.polaquedo, seed.negociacoes.polaquedo, Object.values(seed.despesas).filter(d => d.eventoId === 'polaquedo'), [], [], seed.locais.loc_polaquedo) };
  const cFest = { id: 'festival', liberadoParaSolicitacao: true, ...calcEvento({ id: 'festival', ...seed.eventos.festival }, seed.eventos_fin.festival, seed.negociacoes.festival, Object.values(seed.despesas).filter(d => d.eventoId === 'festival'), Object.values(seed.advanced).filter(a => a.escopo === 'festival'), Object.values(seed.antecipacoes).filter(a => a.eventoId === 'festival'), seed.locais.loc_teatro) };
  const cStd = { id: 'standup', liberadoParaSolicitacao: true, ...calcEvento({ id: 'standup', ...seed.eventos.standup }, seed.eventos_fin.standup, seed.negociacoes.standup, [], [], [], seed.locais.loc_comedy) };

  const cons = calcConsolidado(seed.produtoras.prod_exemplo, [cPol, cFest, cStd], Object.values(seed.advanced));

  const saldo = calcSaldoProdutora({
    produtoraId: 'prod_exemplo',
    produtora: seed.produtoras.prod_exemplo,
    eventosCalculados: [cPol, cFest, cStd],
    consolidado: cons,
    repasses: Object.values(seed.repasses),
    antecipacoes: Object.values(seed.antecipacoes),
    advanced: Object.values(seed.advanced)
  });

  assert.equal(saldo.liberavelEventos, 5056.00); // 240 + 4816
  assert.equal(saldo.saldoDisponivel, 4056.00);
  assert.equal(saldo.repassado, 5000.00);
  assert.equal(saldo.emAntecipacao, 6000.00);
  assert.equal(saldo.advancedEmAberto, 2000.00);

  // Verifica que extrato_produtor não vaza chaves proibidas
  const ext = extrato_produtor(saldo, Object.values(seed.repasses));
  const extJson = JSON.stringify(ext).toLowerCase();
  assert.equal(extJson.includes('taxaadm'), false);
  assert.equal(extJson.includes('taxaop'), false);
  assert.equal(extJson.includes('spread'), false);

  // Fluxo de Caixa projetado x realizado (30/60/90 dias)
  const fc = calcFluxoCaixa({
    contasReceber: [
      { id: 'cr1', vencimento: '15/10/2026', valor: 10000, status: 'Recebida' },
      { id: 'cr2', vencimento: '20/10/2026', valor: 5000, status: 'Prevista', liquidacaoDmais: 2 }
    ],
    contasPagar: [
      { id: 'cp1', vencimento: '16/10/2026', valor: 4056, status: 'Paga' },
      { id: 'cp2', vencimento: '25/11/2026', valor: 2000, status: 'Prevista' }
    ],
    saldoInicial: 1000,
    dataReferencia: '15/10/2026',
    somarDiasUteisFn: somarDiasUteis
  });

  assert.equal(fc.janelas.d30.entradasRealizadas, 10000);
  assert.equal(fc.janelas.d30.entradasProjetadas, 5000);
  assert.equal(fc.janelas.d30.saidasRealizadas, 4056);
  assert.equal(fc.janelas.d60.saidasProjetadas, 2000);
});

test('SEÇÃO 5.4 — SEGURANÇA RTDB: /contas_pagar, /contas_receber, /saldos, /fluxo_caixa restritos ao financeiro; /lancamentos imutável; /extrato_produtor somente leitura', () => {
  const r = rules.rules;

  for (const node of ['contas_pagar', 'contas_receber', 'saldos', 'fluxo_caixa', 'fechamentos']) {
    assert.equal(r[node]['.read'], "auth != null && auth.token.role === 'financeiro'");
    assert.equal(r[node]['.write'], "auth != null && auth.token.role === 'financeiro'");
  }

  // Ledger imutável e bloqueado quando competência fechada
  assert.ok(r.lancamentos.$lancamentoId['.write'].includes('!data.exists()'));
  assert.ok(r.lancamentos.$lancamentoId['.write'].includes("root.child('fechamentos')"));

  // /extrato_produtor somente leitura pelo produtor dono ou financeiro
  assert.ok(r.extrato_produtor.$produtoraId['.read'].includes("auth.token.produtoraId === $produtoraId"));
  assert.equal(r.extrato_produtor.$produtoraId['.write'], false);
});
