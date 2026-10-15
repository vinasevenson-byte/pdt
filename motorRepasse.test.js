/**
 * Testes Unitários e de Aceitação — Hub de Repasses DiskIngressos (PROMPT 2 & PROMPT 7)
 * Execução: node --test motorRepasse.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  capacidadeUsada,
  calcEvento,
  calcConsolidado,
  bordero_produtor,
  somarDiasUteis,
  calcTransferencia,
  calcularRateioRepasse,
  simularVendasEvento
} = require('./motorRepasse.js');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'database.rules.json'), 'utf8'));

function calcSeedEvent(eventoId) {
  const ev = { id: eventoId, ...seed.eventos[eventoId] };
  const fin = seed.eventos_fin[eventoId];
  const neg = seed.negociacoes[eventoId];
  const loc = seed.locais[ev.localId];
  const despesasEv = Object.values(seed.despesas).filter(d => d.eventoId === eventoId);
  const advEv = Object.values(seed.advanced).filter(a => a.escopo === eventoId);
  const antEv = Object.values(seed.antecipacoes).filter(a => a.eventoId === eventoId);

  return calcEvento(ev, fin, neg, despesasEv, advEv, antEv, loc);
}

test('PROMPT 7 — EVENTO 1 (Polaquedo): capacidade 500, vendidos 150 (30%), resultado 1.200, A=720, B=240, LIBERÁVEL 240,00, retido 960', () => {
  const c = calcSeedEvent('polaquedo');

  assert.equal(c.capacidadeUsada, 500);
  assert.equal(c.vendidos, 150);
  assert.equal(c.pctVendido, 30);
  assert.equal(c.bil, 6000);
  assert.equal(c.taxaOp, 300);
  assert.equal(c.taxaAdm, 300);
  assert.equal(c.totRetencoes, 3700); // ISS 300 + ECAD 600 + Locação 2000 + Segurança 800
  assert.equal(c.totOps, 500);        // Bilheteiros 2x150 + Validadores 2x100
  assert.equal(c.despesas, 0);        // Despesa Camarim 500 "A pagar" não entra
  assert.equal(c.resultado, 1200);
  assert.equal(c.A, 720);
  assert.equal(c.liberaPctB, 20);
  assert.equal(c.B, 240);
  assert.equal(c.liberavel, 240.00);
  assert.equal(c.retido, 960.00);
});

test('PROMPT 7 — EVENTO 2 (Festival de Inverno): setor Plateia (1.200), vendidos 720 (60%), resultado 33.040, B=13.216, +créditos 2.720, LIBERÁVEL 4.816,00', () => {
  const c = calcSeedEvent('festival');

  assert.equal(c.capacidadeUsada, 1200);
  assert.equal(c.vendidos, 720);
  assert.equal(c.pctVendido, 60);
  assert.equal(c.bil, 72000);
  assert.equal(c.taxaOp, 2160);
  assert.equal(c.taxaAdm, 3600);
  assert.equal(c.despesas, 2000);     // 1200 + 800 pagas
  assert.equal(c.totRetencoes, 27300);// ISS 3600 + ECAD 7200 + Locação 15000 + Brigada 1500
  assert.equal(c.totOps, 3900);       // 4x150 + 2x400 + 6x100 + 2x350 + 1x1200
  assert.equal(c.resultado, 33040);
  assert.equal(c.rebate, 720);
  assert.equal(c.patrocinio, 2000);
  assert.equal(c.creditos, 2720);
  assert.equal(c.taxaAdmLiquida, 880);// 3600 - 720 - 2000
  assert.equal(c.liberaPctB, 40);
  assert.equal(c.B, 13216);
  assert.equal(c.liberadoRegra, 15936); // 13216 + 2720
  assert.equal(c.jaRepassado, 5000);
  assert.equal(c.antEv, 6120);        // 6000 + 2%
  assert.equal(c.liberavel, 4816.00);
});

test('PROMPT 7 — EVENTO 3 (Noite de Stand-up): capacidade 800, vendidos 60 (7,5%), resultado 1.440, LIBERÁVEL 0,00, retido 1.440, faltam 180 ingressos p/ 30%', () => {
  const c = calcSeedEvent('standup');

  assert.equal(c.capacidadeUsada, 800);
  assert.equal(c.vendidos, 60);
  assert.equal(c.pctVendido, 7.5);
  assert.equal(c.bil, 3600);
  assert.equal(c.taxaOp, 300);
  assert.equal(c.taxaAdm, 180);
  assert.equal(c.totRetencoes, 1680); // ISS 180 + Locação 1500 (ECAD desativado)
  assert.equal(c.resultado, 1440);
  assert.equal(c.liberavel, 0.00);
  assert.equal(c.retido, 1440.00);
  assert.ok(c.proximaFaixa);
  assert.equal(c.proximaFaixa.gatilhoPct, 30);
  assert.equal(c.proximaFaixa.ingressosFaltantes, 180);
});

test('PROMPT 7 — CONSOLIDADO DA PRODUTORA: taxa adm líquida total = 1.360, patrocínio 1.000, advanced 2.000, seleção Polaquedo + Festival = DISPONÍVEL 4.056,00', () => {
  const cPolaquedo = { id: 'polaquedo', liberadoParaSolicitacao: true, ...calcSeedEvent('polaquedo') };
  const cFestival = { id: 'festival', liberadoParaSolicitacao: true, ...calcSeedEvent('festival') };
  const cStandup = { id: 'standup', liberadoParaSolicitacao: true, ...calcSeedEvent('standup') };

  const cons = calcConsolidado(
    seed.produtoras.prod_exemplo,
    [cPolaquedo, cFestival, cStandup],
    Object.values(seed.advanced)
  );

  assert.equal(cons.taxaAdmLiqTotal, 1360); // 300 + 880 + 180
  assert.equal(cons.patrocinioProdutora, 1000);
  assert.equal(cons.advConsolidado, 2000);
  assert.equal(cons.disponivel(['polaquedo', 'festival']), 4056.00);
  assert.equal(cons.disponivel([]), 0);
});

test('PROMPT 7 — TESTES DE SEGURANÇA: Patrocínio de 3.000 na produtora credita só 1.360 e gera alerta de excedente de 1.640', () => {
  const cPolaquedo = { id: 'polaquedo', liberadoParaSolicitacao: true, ...calcSeedEvent('polaquedo') };
  const cFestival = { id: 'festival', liberadoParaSolicitacao: true, ...calcSeedEvent('festival') };
  const cStandup = { id: 'standup', liberadoParaSolicitacao: true, ...calcSeedEvent('standup') };

  const prodPat3000 = {
    nome: 'Produtora Exemplo',
    patrocinio: { ativo: true, descricao: 'Patrocínio Master', valor: 3000 }
  };

  const cons = calcConsolidado(prodPat3000, [cPolaquedo, cFestival, cStandup], []);
  assert.equal(cons.patrocinioProdutora, 1360);
  assert.equal(cons.excedentePatrocinioProdutora, 1640);
});

test('PROMPT 7 — TESTES DE SEGURANÇA: bordero_produtor e produtor.html não vazam taxas Disk ("taxaAdm", "taxaOp", "conveniencia", "eventos_fin", "negociacoes")', () => {
  for (const id of ['polaquedo', 'festival', 'standup']) {
    const calc = calcSeedEvent(id);
    const bp = bordero_produtor(calc);

    // Verifica que borderoEvento = bil - taxaAdm - taxaOp
    assert.equal(bp.borderoEvento, calc.bil - calc.taxaAdm - calc.taxaOp);

    // Verifica chaves de topo e subchaves contra termos proibidos de taxas Disk
    const allKeys = [];
    function collectKeys(obj) {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        allKeys.push(k);
        if (Array.isArray(v)) v.forEach(collectKeys);
        else if (v && typeof v === 'object') collectKeys(v);
      }
    }
    collectKeys(bp);

    for (const key of allKeys) {
      const lower = key.toLowerCase();
      assert.equal(lower.includes('taxa'), false, `Chave proibida contendo "taxa": ${key}`);
      assert.equal(lower.includes('adm'), false, `Chave proibida contendo "adm": ${key}`);
      assert.equal(lower.includes('conveniencia'), false, `Chave proibida contendo "conveniencia": ${key}`);
      assert.notEqual(lower, 'taxaop', `Chave proibida "taxaOp": ${key}`);
      assert.notEqual(lower, 'op', `Chave proibida "op": ${key}`);
    }
  }

  // Verifica código-fonte de produtor.html contra termos proibidos
  const prodHtml = fs.readFileSync(path.join(__dirname, 'produtor.html'), 'utf8');
  assert.equal(prodHtml.includes('taxaAdm'), false);
  assert.equal(prodHtml.includes('taxaOp'), false);
  assert.equal(prodHtml.includes('conveniencia'), false);
  assert.equal(prodHtml.includes('eventos_fin'), false);
  assert.equal(prodHtml.includes('negociacoes'), false);
  assert.equal(prodHtml.includes('motorRepasse.js'), false);
});

test('PROMPT 7 — TESTES DE SEGURANÇA: Regras do Firebase RTDB bloqueiam acesso do produtor a /eventos_fin, /negociacoes, /auditoria e alteração de status', () => {
  const r = rules.rules;

  // /eventos_fin, /negociacoes e /auditoria exclusivos do financeiro
  assert.equal(r.eventos_fin.$eventoId['.read'], "auth != null && auth.token.role === 'financeiro'");
  assert.equal(r.negociacoes.$eventoId['.read'], "auth != null && auth.token.role === 'financeiro'");
  assert.equal(r.auditoria['.read'], "auth != null && auth.token.role === 'financeiro'");
  assert.equal(r.auditoria['.write'], "auth != null && auth.token.role === 'financeiro'");

  // Produtor A só lê eventos onde data.child('produtoraId').val() === auth.token.produtoraId
  assert.ok(r.eventos.$eventoId['.read'].includes("data.child('produtoraId').val() === auth.token.produtoraId"));

  // Produtor só pode criar /repasses se !data.exists() e status === 'Solicitado'
  assert.ok(r.repasses.$repasseId['.write'].includes("!data.exists()"));
  assert.ok(r.repasses.$repasseId['.write'].includes("newData.child('status').val() === 'Solicitado'"));
  assert.equal(r.repasses.$repasseId.memoriaCalculo['.write'], false);
  assert.equal(r.borderos_produtor.$produtoraId['.write'], false);
});

test('REGRA DE NEGÓCIO 1 — Despesas: abate TODAS as despesas lançadas (Pago + A pagar) por padrão', () => {
  const ev = { id: 'polaquedo', ...seed.eventos.polaquedo };
  const finTodas = structuredClone(seed.eventos_fin.polaquedo);
  delete finTodas.regra.abaterDespesasAPagar; // padrão = true (Pago + A pagar)
  const neg = seed.negociacoes.polaquedo;
  const loc = seed.locais[ev.localId];
  const despesasEv = [
    { valor: 300, status: 'Pago' },
    { valor: 500, status: 'A pagar' }
  ];

  const c = calcEvento(ev, finTodas, neg, despesasEv, [], [], loc);
  assert.equal(c.despesasPagas, 300);
  assert.equal(c.despesasAPagar, 500);
  assert.equal(c.despesas, 800);
  assert.equal(c.resultado, 400); // 1200 - 800
});

test('REGRA DE NEGÓCIO 2 — Tarifa de transferência: PIX gratuito (R$ 0,00) e TED configurável (R$ 10,00)', () => {
  const cfg = { pixValor: 0, tedValor: 10 };
  const pix = calcTransferencia(4056, 'PIX', cfg);
  assert.equal(pix.tarifa, 0);
  assert.equal(pix.valorLiquido, 4056);

  const ted = calcTransferencia(4056, 'TED', cfg);
  assert.equal(ted.tarifa, 10);
  assert.equal(ted.valorLiquido, 4046);
});

test('REGRA DE NEGÓCIO 3 — Prazo D+X em dias úteis bancários (pula sábado, domingo e feriados nacionais)', () => {
  // 03/10/2026 é sábado -> D+1 útil = 05/10/2026 (segunda), D+2 úteis = 06/10/2026 (terça)
  assert.equal(somarDiasUteis('03/10/2026', 2), '06/10/2026');

  // 09/10/2026 é sexta-feira e 12/10/2026 (segunda) é feriado nacional (N. Sra. Aparecida)
  // D+1 útil = 13/10/2026 (terça), D+2 úteis = 14/10/2026 (quarta)
  assert.equal(somarDiasUteis('09/10/2026', 2), '14/10/2026');
});

test('MELHORIA 2 — Rateio de Repasse Editável: proporcional vs. manual com validação de soma exata', () => {
  const eventosSel = [
    { id: 'polaquedo', liberavel: 240 },
    { id: 'festival', liberavel: 4816 }
  ];

  // Proporcional sobre R$ 4.056,00
  const prop = calcularRateioRepasse(eventosSel, 4056, 'proporcional');
  assert.equal(prop.valido, true);
  assert.equal(prop.somaQuotas, 4056);
  assert.equal(prop.quotasPorEvento.polaquedo, 192.53);
  assert.equal(prop.quotasPorEvento.festival, 3863.47);

  // Manual válido (soma exata = 4.056,00)
  const manualOk = calcularRateioRepasse(eventosSel, 4056, 'manual', { polaquedo: 240, festival: 3816 });
  assert.equal(manualOk.valido, true);
  assert.equal(manualOk.quotasPorEvento.polaquedo, 240);
  assert.equal(manualOk.quotasPorEvento.festival, 3816);

  // Manual inválido (soma divergente)
  const manualErro = calcularRateioRepasse(eventosSel, 4056, 'manual', { polaquedo: 100, festival: 3800 });
  assert.equal(manualErro.valido, false);
  assert.ok(manualErro.erro.includes('difere do valor do repasse'));
});

test('MELHORIA 6 — Simulador "E se?" (What-If) de Vendas e Meta de Liberação', () => {
  const ev = { id: 'standup', ...seed.eventos.standup };
  const fin = seed.eventos_fin.standup;
  const neg = seed.negociacoes.standup;
  const loc = seed.locais[ev.localId];

  // Stand-up hoje tem 60 vendidos (7,5%) -> liberável 0,00. Simulando 240 vendidos (30% da cap 800):
  const sim = simularVendasEvento(ev, fin, neg, [], [], [], loc, 240, 2000);
  assert.equal(sim.atual.liberavel, 0);
  assert.equal(sim.simulado.vendidos, 240);
  assert.equal(sim.simulado.pctVendido, 30);
  assert.ok(sim.simulado.liberavel > 0);
  assert.equal(sim.marcosFaixas.length, 4); // 30%, 50%, 80%, 100%
  assert.ok(sim.metaInfo);
  assert.ok(sim.metaInfo.ingressosFaltantes > 0);
});


