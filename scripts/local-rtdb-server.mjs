import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const {
  calcEvento,
  calcConsolidado,
  bordero_produtor,
  calcTransferencia,
  calcularRateioRepasse,
  gerarTitulosEvento,
  calcSaldoProdutora,
  calcFluxoCaixa
} = require(path.join(rootDir, 'packages/motor-repasse/src/index.js'));

const seedRaw = fs.readFileSync(path.join(rootDir, 'firebase/seed.json'), 'utf8');
const dbState = JSON.parse(seedRaw);

dbState.contas_pagar = dbState.contas_pagar || {};
dbState.contas_receber = dbState.contas_receber || {};
dbState.saldos = dbState.saldos || {};
dbState.fluxo_caixa = dbState.fluxo_caixa || {};
dbState.lancamentos = dbState.lancamentos || {
  lnc_rep_hist_1: {
    id: 'lnc_rep_hist_1',
    competencia: '2026-10',
    dataLancamento: '2026-10-05',
    produtoraId: 'prod_exemplo',
    eventoId: 'festival',
    origemModulo: 'Repasses',
    origemId: 'rep_hist_1',
    contaDebito: '2.1.01.01 - Obrigações de Repasse Produtor',
    contaCredito: '1.1.01.02 - Conta Movimento Bancária Disk',
    valor: 5000,
    historico: 'Liquidação bancária repasse rep_hist_1 (TED-ITAU-20261005-994812)',
    usuario: 'financeiro@diskingressos.com.br',
    criadoEm: '05/10/2026 16:45'
  }
};
dbState.fechamentos = dbState.fechamentos || {
  '2026-09': { competencia: '2026-09', fechado: true, fechadoPor: 'financeiro@diskingressos.com.br' }
};

function formatarDataHoraBR() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function recalcularTudo() {
  for (const [prodId, prod] of Object.entries(dbState.produtoras || {})) {
    const eventosCalculados = [];
    const despesasList = Object.entries(dbState.despesas || {}).map(([id, d]) => ({ id, ...d }));
    const advancedList = Object.entries(dbState.advanced || {})
      .map(([id, a]) => ({ id, ...a }))
      .filter(a => a.produtoraId === prodId);
    const antecipacoesList = Object.entries(dbState.antecipacoes || {})
      .map(([id, a]) => ({ id, ...a }))
      .filter(a => a.produtoraId === prodId);

    dbState.borderos_produtor = dbState.borderos_produtor || {};
    dbState.borderos_produtor[prodId] = dbState.borderos_produtor[prodId] || {};

    for (const [evId, evData] of Object.entries(dbState.eventos || {})) {
      if (evData.produtoraId !== prodId) continue;
      const ev = { id: evId, ...evData };
      const fin = (dbState.eventos_fin || {})[evId] || {};
      const neg = (dbState.negociacoes || {})[evId] || {};
      const loc = (dbState.locais || {})[ev.localId] || {};
      const despEv = despesasList.filter(d => d.eventoId === evId);
      const advEv = advancedList.filter(a => a.escopo === evId);
      const antEv = antecipacoesList.filter(a => a.eventoId === evId);

      const calc = calcEvento(ev, fin, neg, despEv, advEv, antEv, loc);
      dbState.borderos_produtor[prodId][evId] = bordero_produtor(calc);

      const titulos = gerarTitulosEvento({
        evento: ev,
        calculoEvento: calc,
        despesas: despEv
      });
      for (const cp of titulos.contasPagar || []) {
        if (!dbState.contas_pagar[cp.id]) dbState.contas_pagar[cp.id] = cp;
      }
      for (const cr of titulos.contasReceber || []) {
        if (!dbState.contas_receber[cr.id]) dbState.contas_receber[cr.id] = cr;
      }

      eventosCalculados.push({
        id: evId,
        nome: ev.nome,
        liberadoParaSolicitacao: Boolean(ev.liberadoParaSolicitacao),
        ...calc
      });
    }

    const cons = calcConsolidado(prod, eventosCalculados, advancedList);
    const cfgTransf = (dbState.config && dbState.config.transferencia) || { pixValor: 0, tedValor: 10 };

    dbState.borderos_produtor[prodId]._consolidado = {
      liberavelEventos: cons.liberavelEventos,
      patrocinioProdutora: cons.patrocinioProdutora,
      patrocinioDescricao: (prod.patrocinio && prod.patrocinio.descricao) || 'Patrocínio da produtora',
      advConsolidado: cons.advConsolidado,
      devedores: cons.devedores,
      saldoDisponivel: cons.saldoDisponivel,
      tarifaPix: Number(cfgTransf.pixValor || 0),
      tarifaTed: Number(cfgTransf.tedValor !== undefined ? cfgTransf.tedValor : 10),
      atualizadoEm: formatarDataHoraBR()
    };

    const repassesProd = Object.entries(dbState.repasses || {})
      .map(([id, r]) => ({ id, ...r }))
      .filter(r => r.produtoraId === prodId);

    dbState.saldos[prodId] = calcSaldoProdutora({
      produtora: { id: prodId, ...prod },
      eventosCalculados,
      consolidado: cons,
      repasses: repassesProd,
      antecipacoes: antecipacoesList,
      advancedList
    });
  }

  dbState.fluxo_caixa = calcFluxoCaixa({
    dataBase: '2026-10-18',
    saldoInicialBancario: 50000,
    contasReceber: Object.values(dbState.contas_receber || {}),
    contasPagar: Object.values(dbState.contas_pagar || {})
  });
}

recalcularTudo();

function montarEstadoProdutor(produtoraId) {
  const prod = (dbState.produtoras || {})[produtoraId] || {};
  const borderos = (dbState.borderos_produtor || {})[produtoraId] || {};
  const cons = borderos._consolidado || {};
  const eventos = [];

  for (const [evId, raw] of Object.entries(borderos)) {
    if (evId === '_consolidado' || !raw || typeof raw !== 'object') continue;
    const meta = (dbState.eventos || {})[evId] || {};
    const loc = meta.localId ? (dbState.locais || {})[meta.localId] : null;
    eventos.push({
      id: evId,
      nome: String(meta.nome || evId),
      data: String(meta.data || ''),
      local: loc ? `${loc.nome} · ${loc.cidade}/${loc.uf}` : '',
      liberadoParaSolicitacao: meta.liberadoParaSolicitacao !== false,
      ...raw
    });
  }

  const contasMap = (dbState.contas || {})[produtoraId] || {};
  const contas = Object.entries(contasMap).map(([id, c]) => ({ id, ...c }));
  const repasses = Object.entries(dbState.repasses || {})
    .map(([id, r]) => ({ id, ...r }))
    .filter(r => r.produtoraId === produtoraId);
  const antecipacoes = Object.entries(dbState.antecipacoes || {})
    .map(([id, a]) => ({ id, ...a }))
    .filter(a => a.produtoraId === produtoraId)
    .map(a => ({ ...a, percentualEncargo: Number(a.taxaPct || 2) }));
  const despesas = Object.entries(dbState.despesas || {})
    .map(([id, d]) => ({ id, ...d }))
    .filter(d => d.produtoraId === produtoraId);

  const cfgAnt = (dbState.config && dbState.config.antecipacao) || { pctLimite: 50, taxaPct: 2 };

  return {
    carregado: true,
    produtoraId,
    produtoraNome: String(prod.nome || produtoraId),
    cnpj: String(prod.cnpj || ''),
    consolidado: {
      liberavelEventos: Number(cons.liberavelEventos || 0),
      patrocinioProdutora: Number(cons.patrocinioProdutora || 0),
      patrocinioDescricao: String(cons.patrocinioDescricao || 'Patrocínio da produtora'),
      advConsolidado: Number(cons.advConsolidado || 0),
      devedores: Number(cons.devedores || 0),
      saldoDisponivel: Number(cons.saldoDisponivel || 0),
      tarifaPix: Number(cons.tarifaPix || 0),
      tarifaTed: Number(cons.tarifaTed !== undefined ? cons.tarifaTed : 10),
      atualizadoEm: String(cons.atualizadoEm || '')
    },
    eventos,
    contas,
    repasses,
    antecipacoes,
    antecipacaoConfig: {
      pctLimite: Number(cfgAnt.pctLimite || 50),
      percentualEncargo: Number(cfgAnt.taxaPct || 2)
    },
    despesas
  };
}

function montarEstadoFinanceiro() {
  const eventosFormatados = {};
  for (const [evId, ev] of Object.entries(dbState.eventos || {})) {
    eventosFormatados[evId] = ev;
  }
  const eventosFinFormatados = {};
  for (const [evId, fin] of Object.entries(dbState.eventos_fin || {})) {
    const ev = (dbState.eventos || {})[evId] || {};
    eventosFinFormatados[evId] = {
      ...fin,
      borderoBruto: Number(ev.bilheteria || 0),
      taxaAdmPct: Number((fin.taxaAdm && fin.taxaAdm.percentual) || 0)
    };
  }
  const negFormatadas = {};
  for (const [evId, neg] of Object.entries(dbState.negociacoes || {})) {
    const fin = (dbState.eventos_fin || {})[evId] || {};
    negFormatadas[evId] = {
      ...neg,
      taxaOpTipo: (neg.taxaOp && neg.taxaOp.tipo) || 'percentual',
      taxaOpValor: Number((neg.taxaOp && neg.taxaOp.valor) || 0),
      rebatePct: Number((fin.rebate && fin.rebate.valor) || 0)
    };
  }

  return {
    carregado: true,
    produtoras: dbState.produtoras || {},
    eventos: eventosFormatados,
    eventosFin: eventosFinFormatados,
    negociacoes: negFormatadas,
    repasses: dbState.repasses || {},
    antecipacoes: dbState.antecipacoes || {},
    advanced: dbState.advanced || {},
    contasPorProdutora: dbState.contas || {},
    despesas: dbState.despesas || {},
    contasPagar: dbState.contas_pagar || {},
    contasReceber: dbState.contas_receber || {},
    saldos: dbState.saldos || {},
    fluxoCaixa: dbState.fluxo_caixa || {},
    lancamentos: dbState.lancamentos || {},
    fechamentos: dbState.fechamentos || {},
    auditoria: dbState.auditoria || {}
  };
}

function lerJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost:9005'}`);

  try {
    if (req.method === 'GET' && url.pathname === '/rtdb/financeiro') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(montarEstadoFinanceiro()));
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/rtdb/produtor/')) {
      const prodId = decodeURIComponent(url.pathname.replace('/rtdb/produtor/', '')) || 'prod_exemplo';
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(montarEstadoProdutor(prodId)));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/solicitarRepasse') {
      const body = await lerJsonBody(req);
      const prodId = body.produtoraId || 'prod_exemplo';
      const id = `rep_${Date.now()}`;
      const cfgTransf = (dbState.config && dbState.config.transferencia) || { pixValor: 0, tedValor: 10 };
      const transf = calcTransferencia(Number(body.valor || 0), body.forma || 'PIX', cfgTransf);
      const agora = formatarDataHoraBR();

      const novo = {
        produtoraId: prodId,
        eventoIds: body.eventoIds || [],
        valorSolicitado: transf.valorBruto,
        tarifaTransferencia: transf.tarifa,
        valorLiquido: transf.valorLiquido,
        forma: transf.forma,
        contaId: body.contaId || 'c1',
        status: 'Solicitado',
        solicitadoEm: agora,
        assinaturaSolicitante: {
          uid: 'uid_prod_local',
          email: 'produtor@produtoraexemplo.com.br',
          produtoraId: prodId,
          aceiteBancario: Boolean(body.aceiteBancario),
          aceiteTermosBordero: Boolean(body.aceiteTermosBordero),
          assinadoEm: agora
        }
      };
      dbState.repasses[id] = novo;
      dbState.contas_pagar[`cp_rep_${id}`] = {
        id: `cp_rep_${id}`,
        produtoraId: prodId,
        eventoId: (body.eventoIds || [])[0] || '',
        repasseId: id,
        categoria: 'Repasse Produtor',
        fornecedor: prodId,
        valorOriginal: transf.valorLiquido,
        valorPago: 0,
        status: 'Prevista',
        criadoEm: agora
      };
      recalcularTudo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ id, ...novo }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/decidirRepasse') {
      const body = await lerJsonBody(req);
      const rep = dbState.repasses[body.repasseId];
      if (!rep) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Repasse não encontrado' }));
        return;
      }
      const agora = formatarDataHoraBR();
      if (body.acao === 'recusar') {
        rep.status = 'Recusado';
        rep.motivoRecusa = body.motivo || 'Recusado pelo Financeiro';
        rep.decididoEm = agora;
        if (dbState.contas_pagar[`cp_rep_${body.repasseId}`]) {
          dbState.contas_pagar[`cp_rep_${body.repasseId}`].status = 'Cancelada';
        }
      } else {
        rep.status = body.acao === 'pagar' ? 'Pago' : 'Aprovado';
        rep.decididoEm = agora;
        const evIds = rep.eventoIds || [];
        if (evIds.length > 0) {
          const quota = Math.round((Number(rep.valorSolicitado || 0) / evIds.length) * 100) / 100;
          for (const evId of evIds) {
            if (dbState.eventos[evId]) {
              dbState.eventos[evId].jaRepassado = Number(dbState.eventos[evId].jaRepassado || 0) + quota;
            }
          }
        }
        if (dbState.contas_pagar[`cp_rep_${body.repasseId}`]) {
          dbState.contas_pagar[`cp_rep_${body.repasseId}`].status = rep.status === 'Pago' ? 'Paga' : 'Aprovada';
        }
      }
      recalcularTudo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: rep.status }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/solicitarAntecipacao') {
      const body = await lerJsonBody(req);
      const id = `ant_${Date.now()}`;
      const nova = {
        produtoraId: body.produtoraId || 'prod_exemplo',
        eventoId: body.eventoId,
        data: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        valor: Number(body.valor || 0),
        taxaPct: 2,
        abaterNoProximo: true,
        status: 'Solicitada'
      };
      dbState.antecipacoes[id] = nova;
      recalcularTudo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ id, ...nova }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/rtdb/conta') {
      const body = await lerJsonBody(req);
      const prodId = body.produtoraId || 'prod_exemplo';
      const id = `c_${Date.now()}`;
      dbState.contas[prodId] = dbState.contas[prodId] || {};
      dbState.contas[prodId][id] = {
        banco: body.banco,
        agencia: body.agencia,
        conta: body.conta,
        pix: body.pix,
        titular: body.titular,
        status: 'Pendente',
        padrao: false
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ id }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/rtdb/validarConta') {
      const body = await lerJsonBody(req);
      const { produtoraId, contaId, status } = body;
      if (dbState.contas[produtoraId] && dbState.contas[produtoraId][contaId]) {
        dbState.contas[produtoraId][contaId].status = status;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/rtdb/decidirAntecipacao') {
      const body = await lerJsonBody(req);
      const { antecipacaoId, status } = body;
      if (dbState.antecipacoes[antecipacaoId]) {
        dbState.antecipacoes[antecipacaoId].status = status;
      }
      recalcularTudo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Rota não encontrada' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

const PORT = Number(process.env.LOCAL_RTDB_PORT || 9005);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor RTDB/Motor Local ativo em http://0.0.0.0:${PORT}`);
});
