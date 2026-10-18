/**
 * Testes Unitários, Aceitação (Golden Tests) e Segurança — @diskingressos/motor-repasse
 * Execução: node --test packages/motor-repasse/test/motorRepasse.test.js
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
} = require('../src/index.js');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const SEED_PATH = fs.existsSync(path.join(ROOT_DIR, 'firebase/seed.json'))
  ? path.join(ROOT_DIR, 'firebase/seed.json')
  : path.join(ROOT_DIR, 'seed.json');
const RULES_PATH = fs.existsSync(path.join(ROOT_DIR, 'firebase/database.rules.json'))
  ? path.join(ROOT_DIR, 'firebase/database.rules.json')
  : path.join(ROOT_DIR, 'database.rules.json');

const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));

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

function listFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(full));
    } else if (/\.(js|jsx|ts|tsx|html|json)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

test('GOLDEN TEST 1 (Polaquedo): capacidade 500, vendidos 150 (30%), resultado 1.200, A=720, B=240, LIBERÁVEL 240,00, retido 960', () => {
  const c = calcSeedEvent('polaquedo');

  assert.equal(c.capacidadeUsada, 500);
  assert.equal(c.vendidos, 150);
  assert.equal(c.pctVendido, 30);
  assert.equal(c.bil, 6000);
  assert.equal(c.taxaOp, 300);
  assert.equal(c.taxaAdm, 300);
  assert.equal(c.totRetencoes, 3700);
  assert.equal(c.totOps, 500);
  assert.equal(c.despesas, 0);
  assert.equal(c.resultado, 1200);
  assert.equal(c.A, 720);
  assert.equal(c.liberaPctB, 20);
  assert.equal(c.B, 240);
  assert.equal(c.liberavel, 240.00);
  assert.equal(c.retido, 960.00);
});

test('GOLDEN TEST 2 (Festival de Inverno): setor Plateia (1.200), vendidos 720 (60%), resultado 33.040, B=13.216, +créditos 2.720, LIBERÁVEL 4.816,00', () => {
  const c = calcSeedEvent('festival');

  assert.equal(c.capacidadeUsada, 1200);
  assert.equal(c.vendidos, 720);
  assert.equal(c.pctVendido, 60);
  assert.equal(c.bil, 72000);
  assert.equal(c.taxaOp, 2160);
  assert.equal(c.taxaAdm, 3600);
  assert.equal(c.despesas, 2000);
  assert.equal(c.totRetencoes, 27300);
  assert.equal(c.totOps, 3900);
  assert.equal(c.resultado, 33040);
  assert.equal(c.rebate, 720);
  assert.equal(c.patrocinio, 2000);
  assert.equal(c.creditos, 2720);
  assert.equal(c.taxaAdmLiquida, 880);
  assert.equal(c.liberaPctB, 40);
  assert.equal(c.B, 13216);
  assert.equal(c.liberadoRegra, 15936);
  assert.equal(c.jaRepassado, 5000);
  assert.equal(c.antEv, 6120);
  assert.equal(c.liberavel, 4816.00);
});

test('GOLDEN TEST 3 (Noite de Stand-up): capacidade 800, vendidos 60 (7,5%), resultado 1.440, LIBERÁVEL 0,00, retido 1.440, faltam 180 ingressos p/ 30%', () => {
  const c = calcSeedEvent('standup');

  assert.equal(c.capacidadeUsada, 800);
  assert.equal(c.vendidos, 60);
  assert.equal(c.pctVendido, 7.5);
  assert.equal(c.bil, 3600);
  assert.equal(c.taxaOp, 300);
  assert.equal(c.taxaAdm, 180);
  assert.equal(c.totRetencoes, 1680);
  assert.equal(c.resultado, 1440);
  assert.equal(c.liberavel, 0.00);
  assert.equal(c.retido, 1440.00);
  assert.ok(c.proximaFaixa);
  assert.equal(c.proximaFaixa.gatilhoPct, 30);
  assert.equal(c.proximaFaixa.ingressosFaltantes, 180);
});

test('GOLDEN TEST 4 (Consolidado da Produtora): taxa adm líquida total = 1.360, patrocínio 1.000, advanced 2.000, seleção Polaquedo + Festival = DISPONÍVEL 4.056,00', () => {
  const cPolaquedo = { id: 'polaquedo', liberadoParaSolicitacao: true, ...calcSeedEvent('polaquedo') };
  const cFestival = { id: 'festival', liberadoParaSolicitacao: true, ...calcSeedEvent('festival') };
  const cStandup = { id: 'standup', liberadoParaSolicitacao: true, ...calcSeedEvent('standup') };

  const cons = calcConsolidado(
    seed.produtoras.prod_exemplo,
    [cPolaquedo, cFestival, cStandup],
    Object.values(seed.advanced)
  );

  assert.equal(cons.taxaAdmLiqTotal, 1360);
  assert.equal(cons.patrocinioProdutora, 1000);
  assert.equal(cons.advConsolidado, 2000);
  assert.equal(cons.disponivel(['polaquedo', 'festival']), 4056.00);
  assert.equal(cons.disponivel([]), 0);
});

test('SEGURANÇA 1: Patrocínio de 3.000 na produtora credita só 1.360 e gera alerta de excedente de 1.640', () => {
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

test('SEGURANÇA 2: bordero_produtor, produtor.html e apps/produtor não vazam taxas Disk nem importam motor-repasse', () => {
  for (const id of ['polaquedo', 'festival', 'standup']) {
    const calc = calcSeedEvent(id);
    const bp = bordero_produtor(calc);

    assert.equal(bp.borderoEvento, calc.bil - calc.taxaAdm - calc.taxaOp);

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

  const forbiddenTerms = ['taxaAdm', 'taxaOp', 'conveniencia', 'eventos_fin', 'negociacoes', 'motorRepasse', 'motor-repasse'];

  const prodHtmlPath = path.join(ROOT_DIR, 'produtor.html');
  if (fs.existsSync(prodHtmlPath)) {
    const prodHtml = fs.readFileSync(prodHtmlPath, 'utf8');
    for (const term of forbiddenTerms) {
      assert.equal(prodHtml.includes(term), false, `produtor.html contém termo proibido: ${term}`);
    }
  }

  // Verifica código-fonte e build de apps/produtor
  const produtorAppFiles = [
    ...listFilesRecursive(path.join(ROOT_DIR, 'apps/produtor/src')),
    ...listFilesRecursive(path.join(ROOT_DIR, 'apps/produtor/dist')),
    path.join(ROOT_DIR, 'apps/produtor/package.json')
  ].filter(f => fs.existsSync(f));

  for (const file of produtorAppFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const term of forbiddenTerms) {
      assert.equal(
        content.includes(term),
        false,
        `Arquivo do app produtor (${path.relative(ROOT_DIR, file)}) contém termo proibido: "${term}"`
      );
    }
  }
});

test('SEGURANÇA 3: Regras do Firebase RTDB bloqueiam acesso do produtor a /eventos_fin, /negociacoes, /auditoria e alteração de status', () => {
  const r = rules.rules;

  assert.equal(r.eventos_fin.$eventoId['.read'], "auth != null && auth.token.role === 'financeiro'");
  assert.equal(r.negociacoes.$eventoId['.read'], "auth != null && auth.token.role === 'financeiro'");
  assert.equal(r.auditoria['.read'], "auth != null && auth.token.role === 'financeiro'");
  assert.equal(r.auditoria['.write'], "auth != null && auth.token.role === 'financeiro'");

  assert.ok(r.eventos.$eventoId['.read'].includes("data.child('produtoraId').val() === auth.token.produtoraId"));
  assert.ok(r.repasses.$repasseId['.write'].includes("!data.exists()"));
  assert.ok(r.repasses.$repasseId['.write'].includes("newData.child('status').val() === 'Solicitado'"));
  assert.equal(r.repasses.$repasseId.memoriaCalculo['.write'], false);
  assert.equal(r.borderos_produtor.$produtoraId['.write'], false);
});

test('REGRA DE NEGÓCIO: Despesas, Tarifas PIX/TED, Calendário Bancário D+X, Rateio e Simulador What-If', () => {
  const cfg = { pixValor: 0, tedValor: 10 };
  assert.equal(calcTransferencia(4056, 'PIX', cfg).valorLiquido, 4056);
  assert.equal(calcTransferencia(4056, 'TED', cfg).valorLiquido, 4046);
  assert.equal(somarDiasUteis('03/10/2026', 2), '06/10/2026');
  assert.equal(somarDiasUteis('09/10/2026', 2), '14/10/2026');

  const prop = calcularRateioRepasse([{ id: 'polaquedo', liberavel: 240 }, { id: 'festival', liberavel: 4816 }], 4056, 'proporcional');
  assert.equal(prop.valido, true);
  assert.equal(prop.somaQuotas, 4056);

  const ev = { id: 'standup', ...seed.eventos.standup };
  const sim = simularVendasEvento(ev, seed.eventos_fin.standup, seed.negociacoes.standup, [], [], [], seed.locais[ev.localId], 240, 2000);
  assert.equal(sim.simulado.pctVendido, 30);
  assert.ok(sim.simulado.liberavel > 0);
});
