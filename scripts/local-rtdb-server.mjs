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
  calcFluxoCaixa,
  baixarTitulo,
  gerarEstornoLancamento,
  calcularPreviaFechamento,
  verificarPermissaoReabertura,
  validarSalvarProdutora,
  validarSalvarLocal,
  validarSalvarEvento,
  validarAlteracaoStatusCadastro
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
  const idsEventosProd = new Set(eventos.map(e => e.id));

  const contratos = {};
  for (const [k, c] of Object.entries(dbState.contratos || {})) {
    if (c && (c.produtoraId === produtoraId || idsEventosProd.has(k))) {
      contratos[k] = c;
    }
  }
  const vendas_lotes = {};
  for (const [k, v] of Object.entries(dbState.vendas_lotes || {})) {
    if (v && (v.produtoraId === produtoraId || idsEventosProd.has(k))) {
      vendas_lotes[k] = v;
    }
  }
  const cobrancas_devedores = {};
  for (const [k, cb] of Object.entries(dbState.cobrancas_devedores || {})) {
    if (cb && cb.produtoraId === produtoraId) {
      cobrancas_devedores[k] = cb;
    }
  }
  const notificacoes_central = {};
  for (const [k, nt] of Object.entries(dbState.notificacoes_central || {})) {
    if (nt && nt.produtoraId === produtoraId) {
      notificacoes_central[k] = nt;
    }
  }

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
      tarifaPix: Number(cfgTransfPix(dbState)),
      tarifaTed: Number(cfgTransfTed(dbState)),
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
    despesas,
    contratos,
    vendas_lotes,
    cobrancas_devedores,
    notificacoes_central
  };
}

function cfgTransfPix(state) {
  return Number(((state.config && state.config.transferencia) || {}).pixValor || 0);
}

function cfgTransfTed(state) {
  const t = ((state.config && state.config.transferencia) || {}).tedValor;
  return t !== undefined ? Number(t) : 10;
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
    locais: dbState.locais || {},
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
    auditoria: dbState.auditoria || {},
    config: dbState.config || {},
    usuarios_erp: dbState.usuarios_erp || {},
    auditoria_relatorios: dbState.auditoria_relatorios || {},
    eventos_dominio: dbState.eventos_dominio || {},
    bi_executivo: dbState.bi_executivo || {},
    contratos: dbState.contratos || {},
    vendas_lotes: dbState.vendas_lotes || {},
    recebiveis_agenda: dbState.recebiveis_agenda || {},
    cobrancas_devedores: dbState.cobrancas_devedores || {},
    fornecedores_op: dbState.fornecedores_op || {},
    notificacoes_central: dbState.notificacoes_central || {},
    conciliacoes: dbState.conciliacoes || {},
    remessas: dbState.remessas || {},
    apuracoes_fiscais: dbState.apuracoes_fiscais || {},
    chargebacks: dbState.chargebacks || {}
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
      if (body.acao === 'estornar') {
        if (rep.status !== 'Aprovado' && rep.status !== 'Pago') {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: `Status ${rep.status} não permite estorno` }));
          return;
        }
        const evIds = rep.eventoIds || [];
        const rateio = (rep.memoriaCalculo && rep.memoriaCalculo.rateioAplicado) || null;
        if (rateio) {
          for (const [evId, q] of Object.entries(rateio)) {
            if (dbState.eventos[evId]) {
              dbState.eventos[evId].jaRepassado = Math.max(0, Number(dbState.eventos[evId].jaRepassado || 0) - Number(q || 0));
            }
          }
        } else if (evIds.length > 0) {
          const quota = Math.round((Number(rep.valorSolicitado || 0) / evIds.length) * 100) / 100;
          for (const evId of evIds) {
            if (dbState.eventos[evId]) {
              dbState.eventos[evId].jaRepassado = Math.max(0, Number(dbState.eventos[evId].jaRepassado || 0) - quota);
            }
          }
        }
        dbState.estornos = dbState.estornos || {};
        dbState.estornos[`est_${body.repasseId}`] = {
          id: `est_${body.repasseId}`,
          repasseId: body.repasseId,
          produtoraId: rep.produtoraId,
          statusAnterior: rep.status,
          motivo: body.motivo || 'Estorno no simulador local',
          protocoloDevolucao: body.protocoloDevolucao || null,
          estornadoEm: agora
        };
        rep.status = 'Estornado';
        rep.estornadoEm = agora;
        if (dbState.contas_pagar[`cp_rep_${body.repasseId}`]) {
          dbState.contas_pagar[`cp_rep_${body.repasseId}`].status = 'Cancelada';
        }
      } else if (body.acao === 'recusar') {
        rep.status = 'Recusado';
        rep.motivoRecusa = body.motivo || 'Recusado pelo Financeiro';
        rep.decididoEm = agora;
        if (dbState.contas_pagar[`cp_rep_${body.repasseId}`]) {
          dbState.contas_pagar[`cp_rep_${body.repasseId}`].status = 'Cancelada';
        }
      } else if (rep.status === 'Aprovado' && body.acao === 'pagar') {
        rep.status = 'Pago';
        rep.pagoEm = agora;
        if (dbState.contas_pagar[`cp_rep_${body.repasseId}`]) {
          dbState.contas_pagar[`cp_rep_${body.repasseId}`].status = 'Paga';
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

    if (req.method === 'POST' && (url.pathname === '/rtdb/decidirAntecipacao' || url.pathname === '/callable/decidirAntecipacao')) {
      const body = await lerJsonBody(req);
      const id = body.antId || body.antecipacaoId;
      const status = body.status || (body.acao === 'aprovar' ? 'Aprovada' : body.acao === 'recusar' ? 'Recusada' : 'Paga');
      if (dbState.antecipacoes[id]) {
        dbState.antecipacoes[id].status = status;
      }
      recalcularTudo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, id, status }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/rtdb/salvarEventosTravas') {
      const body = await lerJsonBody(req);
      const { eventoId, eventoPatch, eventoFin, negociacao, usuarioEmail, resumoAuditoria } = body;
      if (eventoId) {
        if (eventoPatch && dbState.eventos[eventoId]) {
          dbState.eventos[eventoId] = { ...dbState.eventos[eventoId], ...eventoPatch };
        }
        if (eventoFin) {
          dbState.eventos_fin = dbState.eventos_fin || {};
          dbState.eventos_fin[eventoId] = eventoFin;
        }
        if (negociacao) {
          dbState.negociacoes = dbState.negociacoes || {};
          dbState.negociacoes[eventoId] = negociacao;
        }
        dbState.auditoria = dbState.auditoria || {};
        dbState.auditoria[`aud_${Date.now()}`] = {
          dataHora: formatarDataHoraBR(),
          usuario: usuarioEmail || 'financeiro@diskingressos.com.br',
          modulo: 'Travas e Taxas',
          eventoId,
          acao: 'Salvo Configuração do Evento e Travas',
          resumo: resumoAuditoria || `Configuração de travas e borderô salva para ${eventoId}.`
        };
        recalcularTudo();
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, eventoId }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/rtdb/salvarNegociacao') {
      const body = await lerJsonBody(req);
      const { eventoId, negociacao, usuarioEmail, resumoAuditoria } = body;
      if (eventoId && negociacao) {
        dbState.negociacoes = dbState.negociacoes || {};
        dbState.negociacoes[eventoId] = {
          ...(dbState.negociacoes[eventoId] || {}),
          ...negociacao
        };
        dbState.auditoria = dbState.auditoria || {};
        dbState.auditoria[`aud_${Date.now()}`] = {
          dataHora: formatarDataHoraBR(),
          usuario: usuarioEmail || 'financeiro@diskingressos.com.br',
          modulo: 'Negociações',
          eventoId,
          acao: 'Salvo Negociação Comercial',
          resumo: resumoAuditoria || `Negociação comercial salva para ${eventoId}.`
        };
        recalcularTudo();
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, eventoId }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/rtdb/salvarAdvanced') {
      const body = await lerJsonBody(req);
      const advId = body.id || `adv_${Date.now()}`;
      dbState.advanced = dbState.advanced || {};
      dbState.advanced[advId] = {
        produtoraId: body.produtoraId || 'prod_exemplo',
        data: body.data || '29/10/2026',
        descricao: body.descricao || 'Adiantamento contratual',
        valor: Number(body.valor || 0),
        escopo: body.escopo || 'consolidado',
        abaterNoProximo: Boolean(body.abaterNoProximo)
      };
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: formatarDataHoraBR(),
        usuario: body.usuarioEmail || 'financeiro@diskingressos.com.br',
        modulo: 'Advanced',
        eventoId: body.escopo || 'consolidado',
        acao: 'Registro de Adiantamento',
        resumo: `${body.descricao} (${advId}) · R$ ${Number(body.valor || 0).toFixed(2)}`
      };
      recalcularTudo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ id: advId, ...dbState.advanced[advId] }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/rtdb/removerAdvanced') {
      const body = await lerJsonBody(req);
      if (body.id && dbState.advanced) {
        delete dbState.advanced[body.id];
      }
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: formatarDataHoraBR(),
        usuario: body.usuarioEmail || 'financeiro@diskingressos.com.br',
        modulo: 'Advanced',
        eventoId: 'consolidado',
        acao: 'Remoção de Adiantamento',
        resumo: `Adiantamento ${body.id} removido.`
      };
      recalcularTudo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, id: body.id }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/rtdb/salvarDespesa') {
      const body = await lerJsonBody(req);
      const despId = body.id || `desp_${Date.now()}`;
      dbState.despesas = dbState.despesas || {};
      dbState.despesas[despId] = {
        eventoId: body.eventoId || 'polaquedo',
        produtoraId: body.produtoraId || 'prod_exemplo',
        data: body.data || '29/10/2026',
        categoria: body.categoria || 'Produção',
        fornecedor: body.fornecedor || 'Fornecedor',
        nfCodigo: body.nfCodigo || '',
        comprovanteUrl: body.comprovanteUrl || '',
        valor: Number(body.valor || 0),
        status: body.status || 'Pago'
      };
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: formatarDataHoraBR(),
        usuario: body.usuarioEmail || 'financeiro@diskingressos.com.br',
        modulo: 'Despesas',
        eventoId: body.eventoId || 'polaquedo',
        acao: 'Lançamento/Edição de Despesa',
        resumo: `${body.categoria} (${body.fornecedor}) · R$ ${Number(body.valor || 0).toFixed(2)} · Status: ${body.status}`
      };
      recalcularTudo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ id: despId, ...dbState.despesas[despId] }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/rtdb/removerDespesa') {
      const body = await lerJsonBody(req);
      if (body.id && dbState.despesas) {
        delete dbState.despesas[body.id];
      }
      if (body.id && dbState.contas_pagar && dbState.contas_pagar[`cp_desp_${body.id}`]) {
        delete dbState.contas_pagar[`cp_desp_${body.id}`];
      }
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: formatarDataHoraBR(),
        usuario: body.usuarioEmail || 'financeiro@diskingressos.com.br',
        modulo: 'Despesas',
        eventoId: body.eventoId || 'Geral',
        acao: 'Remoção de Despesa',
        resumo: `Despesa ${body.id} removida.`
      };
      recalcularTudo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, id: body.id }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/rtdb/criarTitulo') {
      const body = await lerJsonBody(req);
      const isPagar = body.natureza === 'pagar';
      const id = body.id || `${isPagar ? 'cp_man' : 'cr_man'}_${Date.now()}`;
      const agora = formatarDataHoraBR();
      if (isPagar) {
        dbState.contas_pagar[id] = {
          id,
          produtoraId: body.produtoraId || 'prod_exemplo',
          eventoId: body.eventoId || 'polaquedo',
          categoria: body.categoria || 'Fornecedor Operacional',
          fornecedor: body.fornecedorOuOrigem || 'Fornecedor',
          vencimento: body.vencimento || '2026-11-10',
          valorOriginal: Number(body.valorOriginal || 0),
          valorPago: 0,
          status: 'Aprovada',
          criadoEm: agora
        };
      } else {
        dbState.contas_receber[id] = {
          id,
          produtoraId: body.produtoraId || 'prod_exemplo',
          eventoId: body.eventoId || 'polaquedo',
          categoria: body.categoria || 'Bilheteria Adquirente',
          adquirente: body.fornecedorOuOrigem || 'Adquirente Cartão',
          vencimento: body.vencimento || '2026-11-10',
          valorOriginal: Number(body.valorOriginal || 0),
          valorRecebido: 0,
          status: 'Prevista',
          criadoEm: agora
        };
      }
      recalcularTudo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(isPagar ? dbState.contas_pagar[id] : dbState.contas_receber[id]));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/registrarBaixaTitulo') {
      const body = await lerJsonBody(req);
      const { natureza, tituloId, dataBaixa, contaBanco, historico } = body;
      const colecao = natureza === 'pagar' ? 'contas_pagar' : 'contas_receber';
      const tit = (dbState[colecao] || {})[tituloId];
      if (!tit) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: `Título ${tituloId} não encontrado.` }));
        return;
      }
      const lancId = `lnc_bx_${Date.now()}`;
      const { tituloAtualizado, lancamento } = baixarTitulo(
        { id: tituloId, natureza, ...tit },
        {
          lancamentoId: lancId,
          dataBaixa: dataBaixa || '2026-10-29',
          contaBanco,
          historico,
          usuario: 'financeiro@diskingressos.com.br'
        },
        dbState.fechamentos || {}
      );
      dbState[colecao][tituloId] = tituloAtualizado;
      dbState.lancamentos[lancId] = lancamento;
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: formatarDataHoraBR(),
        usuario: 'financeiro@diskingressos.com.br',
        modulo: natureza === 'pagar' ? 'Contas a Pagar' : 'Contas a Receber',
        eventoId: tit.eventoId || tit.produtoraId || 'Geral',
        acao: `Baixa de Título (${tituloId})`,
        resumo: `${lancamento.historico} · R$ ${Number(lancamento.valor || 0).toFixed(2)}`
      };
      recalcularTudo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, titulo: tituloAtualizado, lancamento }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/estornarLancamento') {
      const body = await lerJsonBody(req);
      const { lancamentoId, motivo, dataEstorno } = body;
      const orig = (dbState.lancamentos || {})[lancamentoId];
      if (!orig) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: `Lançamento ${lancamentoId} não encontrado.` }));
        return;
      }
      const estId = `lnc_est_${Date.now()}`;
      const estorno = gerarEstornoLancamento(
        orig,
        {
          id: estId,
          dataLancamento: dataEstorno || '2026-10-29',
          motivo: motivo || 'Estorno operacional solicitado pelo Financeiro',
          usuario: 'financeiro@diskingressos.com.br'
        },
        dbState.fechamentos || {}
      );
      dbState.lancamentos[lancamentoId].estornadoPorLancamentoId = estId;
      dbState.lancamentos[estId] = estorno;
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: formatarDataHoraBR(),
        usuario: 'financeiro@diskingressos.com.br',
        modulo: 'Ledger',
        eventoId: orig.eventoId || 'Geral',
        acao: `Estorno Contábil (${estId})`,
        resumo: `Estorno do lançamento ${lancamentoId}: ${motivo}`
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, lancamentoEstorno: estorno }));
      return;
    }

    if (req.method === 'POST' && (url.pathname === '/rtdb/recalcularFluxoCaixa' || url.pathname === '/callable/recalcularFluxoCaixa')) {
      const body = await lerJsonBody(req);
      dbState.fluxo_caixa = calcFluxoCaixa({
        dataBase: body.dataBase || '2026-10-18',
        saldoInicialBancario: Number(body.saldoInicialBancario ?? 50000),
        contasReceber: Object.values(dbState.contas_receber || {}),
        contasPagar: Object.values(dbState.contas_pagar || {})
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(dbState.fluxo_caixa));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/rtdb/contaPadrao') {
      const body = await lerJsonBody(req);
      const { produtoraId, contaId } = body;
      const mapa = ((dbState.contas || {})[produtoraId]) || {};
      if (!mapa[contaId] || mapa[contaId].status !== 'Validada') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Apenas contas validadas podem ser definidas como conta padrão.' }));
        return;
      }
      for (const [cId, c] of Object.entries(mapa)) {
        if (c && typeof c === 'object') {
          c.padrao = cId === contaId;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, produtoraId, contaId }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/previaFechamento') {
      const body = await lerJsonBody(req);
      const previa = calcularPreviaFechamento({
        competencia: body.competencia,
        lancamentos: dbState.lancamentos || {},
        repasses: dbState.repasses || {},
        estornos: dbState.estornos || {},
        fechamentos: dbState.fechamentos || {}
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(previa));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/fecharCompetencia') {
      const body = await lerJsonBody(req);
      const { competencia, observacoes = '' } = body;
      const previa = calcularPreviaFechamento({
        competencia,
        lancamentos: dbState.lancamentos || {},
        repasses: dbState.repasses || {},
        estornos: dbState.estornos || {},
        fechamentos: dbState.fechamentos || {},
        ignorarTravaPropria: true
      });
      if (previa.bloqueios && previa.bloqueios.length > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: previa.bloqueios.map(b => b.mensagem).join(' | '), bloqueios: previa.bloqueios }));
        return;
      }
      dbState.fechamentos = dbState.fechamentos || {};
      const ant = dbState.fechamentos[competencia] || {};
      const novaVersao = Number(ant.versao || 0) + 1;
      const agora = formatarDataHoraBR();
      const payloadFechado = {
        competencia,
        fechado: true,
        emFechamento: false,
        status: 'Fechado',
        versao: novaVersao,
        seloSha256: previa.seloCalculado,
        seloAnterior: ant.seloSha256 || ant.ultimoSeloSha256 || null,
        fechadoPor: 'financeiro@diskingressos.com.br',
        fechadoPorUid: 'uid_financeiro_local',
        fechadoEm: agora,
        observacoes: String(observacoes || ''),
        resumoBalancete: previa.balancete,
        historicoReaberturas: Array.isArray(ant.historicoReaberturas) ? ant.historicoReaberturas : []
      };
      dbState.fechamentos[competencia] = payloadFechado;
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: agora,
        usuario: 'financeiro@diskingressos.com.br',
        modulo: 'Fechamentos',
        eventoId: competencia,
        acao: `Fechamento de Competência (v${novaVersao})`,
        resumo: `Competência ${competencia} encerrada (v${novaVersao}, selo SHA-256: ${String(previa.seloCalculado || '').slice(0, 16)}…).`
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payloadFechado));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/reabrirCompetencia') {
      const body = await lerJsonBody(req);
      const { competencia, motivo = '' } = body;
      const check = verificarPermissaoReabertura(competencia, {
        fechamentos: dbState.fechamentos || {},
        motivo,
        usuario: 'aprovador@diskingressos.com.br',
        uid: 'uid_aprovador_local',
        segregacaoAtiva: false
      });
      if (!check.permitido) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: check.mensagem }));
        return;
      }
      const agora = formatarDataHoraBR();
      const fechAtual = dbState.fechamentos[competencia];
      const historicoAnterior = Array.isArray(fechAtual.historicoReaberturas) ? [...fechAtual.historicoReaberturas] : [];
      const payloadReaberto = {
        ...fechAtual,
        competencia,
        fechado: false,
        emFechamento: false,
        status: 'Reaberto',
        ultimoSeloSha256: fechAtual.seloSha256 || fechAtual.ultimoSeloSha256 || null,
        reabertoPor: 'aprovador@diskingressos.com.br',
        reabertoEm: agora,
        motivoReabertura: String(motivo).trim(),
        historicoReaberturas: [
          ...historicoAnterior,
          {
            versaoFechada: Number(fechAtual.versao || 1),
            seloSha256: fechAtual.seloSha256 || null,
            fechadoPor: fechAtual.fechadoPor || null,
            fechadoEm: fechAtual.fechadoEm || null,
            reabertoPor: 'aprovador@diskingressos.com.br',
            reabertoEm: agora,
            motivo: String(motivo).trim()
          }
        ]
      };
      dbState.fechamentos[competencia] = payloadReaberto;
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: agora,
        usuario: 'aprovador@diskingressos.com.br',
        modulo: 'Fechamentos',
        eventoId: competencia,
        acao: 'Reabertura de Competência',
        resumo: `Competência ${competencia} reaberta. Motivo: ${String(motivo).trim()}`
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(payloadReaberto));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/salvarProdutora') {
      const body = await lerJsonBody(req);
      const todasProdutoras = dbState.produtoras || {};
      const produtoraExistente = body.id && todasProdutoras[body.id] ? todasProdutoras[body.id] : null;
      const validado = validarSalvarProdutora(body, { produtoraExistente, todasProdutoras });
      const agora = formatarDataHoraBR();
      dbState.cadastro_cnpj = dbState.cadastro_cnpj || {};
      dbState.cadastro_cnpj[validado.cnpjLimpo] = {
        cnpj: validado.cnpjLimpo,
        produtoraId: validado.id,
        reservadoEm: agora
      };
      if (validado.cnpjAnteriorLimpo && validado.cnpjAnteriorLimpo !== validado.cnpjLimpo) {
        delete dbState.cadastro_cnpj[validado.cnpjAnteriorLimpo];
      }
      dbState.produtoras = dbState.produtoras || {};
      dbState.produtoras[validado.id] = {
        ...validado.registro,
        atualizadoEm: agora,
        atualizadoPor: 'financeiro@diskingressos.com.br'
      };
      recalcularTudo();
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: agora,
        usuario: 'financeiro@diskingressos.com.br',
        modulo: 'CadastroMestre',
        eventoId: validado.id,
        acao: validado.ehNovo ? 'Criação de Produtora' : 'Edição de Produtora',
        resumo: `Produtora ${validado.id} (${validado.registro.nome}, CNPJ ${validado.registro.cnpj}) ${validado.ehNovo ? 'criada' : 'atualizada'}.`
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ id: validado.id, criado: validado.ehNovo, ...dbState.produtoras[validado.id] }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/salvarLocal') {
      const body = await lerJsonBody(req);
      const todosLocais = dbState.locais || {};
      const localExistente = body.id && todosLocais[body.id] ? todosLocais[body.id] : null;
      const validado = validarSalvarLocal(body, { localExistente, eventos: dbState.eventos || {} });
      const agora = formatarDataHoraBR();
      dbState.locais = dbState.locais || {};
      dbState.locais[validado.id] = {
        ...validado.registro,
        atualizadoEm: agora,
        atualizadoPor: 'financeiro@diskingressos.com.br'
      };
      recalcularTudo();
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: agora,
        usuario: 'financeiro@diskingressos.com.br',
        modulo: 'CadastroMestre',
        eventoId: validado.id,
        acao: validado.ehNovo ? 'Criação de Local' : 'Edição de Local',
        resumo: `Local ${validado.id} (${validado.registro.nome}, cap. ${validado.registro.capacidadeTotal}) ${validado.ehNovo ? 'criado' : 'atualizado'}.`
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ id: validado.id, criado: validado.ehNovo, ...dbState.locais[validado.id] }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/salvarEvento') {
      const body = await lerJsonBody(req);
      const rawData = String(body.data || '').trim();
      const dataFormatada = /^\d{4}-\d{2}-\d{2}$/.test(rawData)
        ? `${rawData.slice(8, 10)}/${rawData.slice(5, 7)}/${rawData.slice(0, 4)}`
        : rawData;
      const eventoExistente = body.id && (dbState.eventos || {})[body.id] ? dbState.eventos[body.id] : null;
      const validado = validarSalvarEvento(
        { ...body, data: dataFormatada },
        {
          eventoExistente,
          produtoras: dbState.produtoras || {},
          locais: dbState.locais || {}
        }
      );
      const agora = formatarDataHoraBR();
      dbState.eventos = dbState.eventos || {};
      dbState.eventos[validado.id] = {
        ...validado.registro,
        atualizadoEm: agora,
        atualizadoPor: 'financeiro@diskingressos.com.br'
      };
      dbState.eventos_fin = dbState.eventos_fin || {};
      if (validado.ehNovo && !dbState.eventos_fin[validado.id]) {
        dbState.eventos_fin[validado.id] = validado.eventoFinInicial;
      }
      recalcularTudo();
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: agora,
        usuario: 'financeiro@diskingressos.com.br',
        modulo: 'CadastroMestre',
        eventoId: validado.id,
        acao: validado.ehNovo ? 'Criação de Evento' : 'Edição de Evento',
        resumo: `Evento ${validado.id} (${validado.registro.nome}, data ${validado.registro.data}) ${validado.ehNovo ? 'criado' : 'atualizado'}.`
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ id: validado.id, criado: validado.ehNovo, ...dbState.eventos[validado.id] }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/callable/alterarStatusCadastro') {
      const body = await lerJsonBody(req);
      const validado = validarAlteracaoStatusCadastro(body, {
        produtoras: dbState.produtoras || {},
        locais: dbState.locais || {},
        eventos: dbState.eventos || {},
        repasses: dbState.repasses || {},
        antecipacoes: dbState.antecipacoes || {}
      });
      const agora = formatarDataHoraBR();
      dbState[validado.colecao] = dbState[validado.colecao] || {};
      dbState[validado.colecao][validado.id] = {
        ...validado.registroAtualizado,
        statusAlteradoEm: agora,
        statusAlteradoPor: 'financeiro@diskingressos.com.br'
      };
      recalcularTudo();
      dbState.auditoria = dbState.auditoria || {};
      dbState.auditoria[`aud_${Date.now()}`] = {
        dataHora: agora,
        usuario: 'financeiro@diskingressos.com.br',
        modulo: 'CadastroMestre',
        eventoId: validado.id,
        acao: `${validado.ativo ? 'Reativação' : 'Inativação'} de Cadastro (${body.tipo})`,
        resumo: `${body.tipo} ${validado.id} ${validado.ativo ? 'reativado' : `inativado (motivo: ${validado.motivo})`}.`
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ id: validado.id, ...dbState[validado.colecao][validado.id] }));
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
