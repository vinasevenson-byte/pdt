/**
 * Shared Firebase Admin, Auditoria e Recálculo — Cloud Functions (southamerica-east1)
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');

function safeRequire(modName, fallbackFactory) {
  try {
    return require(modName);
  } catch {
    return fallbackFactory();
  }
}

class FallbackHttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const httpsV2 = safeRequire('firebase-functions/v2/https', () => ({
  onCall: (handler) => handler,
  HttpsError: FallbackHttpsError
}));

const databaseV2 = safeRequire('firebase-functions/v2/database', () => ({
  onValueWritten: (_path, handler) => handler
}));

const functionsV2 = safeRequire('firebase-functions/v2', () => ({
  setGlobalOptions: () => {}
}));

const logger = safeRequire('firebase-functions/logger', () => ({
  info: () => {},
  warn: () => {},
  error: () => {}
}));

const admin = safeRequire('firebase-admin', () => ({
  apps: [{}],
  initializeApp: () => {},
  database: () => ({
    ref: () => {
      throw new Error('Firebase Admin RTDB não inicializado neste ambiente de teste sem mock.');
    }
  })
}));

const motorPath = fs.existsSync(path.resolve(__dirname, '../../../../packages/motor-repasse/src/index.js'))
  ? path.resolve(__dirname, '../../../../packages/motor-repasse/src/index.js')
  : path.resolve(__dirname, '../../../../motorRepasse.js');

const corePath = path.resolve(__dirname, '../../../../packages/core/src/index.js');
const {
  ROLES_SISTEMA,
  ROLES_PAINEL_INTERNO,
  MATRIZ_PERMISSOES,
  extrairPapelEfetivo,
  possuiAcessoPainelInterno,
  temPermissao,
  avaliarAlcadaDuplaAprovacao,
  criarEventoDominio,
  publicarEventoDominio
} = fs.existsSync(corePath)
  ? require(corePath)
  : {
      ROLES_SISTEMA: {},
      ROLES_PAINEL_INTERNO: new Set(),
      MATRIZ_PERMISSOES: {},
      extrairPapelEfetivo: (t) => (t && (t.subRole || t.role)) || null,
      possuiAcessoPainelInterno: (t) => Boolean(t && t.role && t.role !== 'produtor'),
      temPermissao: (t) => Boolean(t && t.role === 'financeiro'),
      avaliarAlcadaDuplaAprovacao: () => ({ requerSegundaAprovacao: false, concluido: true }),
      criarEventoDominio: (d) => d,
      publicarEventoDominio: async () => null
    };

const {
  toCents,
  fromCents,
  round2,
  calcEvento,
  calcConsolidado,
  bordero_produtor,
  calcTransferencia,
  calcularRateioRepasse,
  somarDiasUteis,
  calcSaldoProdutora,
  extrato_produtor,
  calcFluxoCaixa,
  gerarTitulosEvento,
  baixarTitulo,
  PLANO_CONTAS,
  obterDataAtualBR,
  obterCompetenciaAtualBR,
  extrairCompetencia,
  competenciaEstaFechada,
  criarLancamentoPartidaDobrada,
  gerarEstornoLancamento
} = require(motorPath);

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.database();

function formatarDataHoraBR(date = new Date()) {
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function registrarAuditoria({ usuario, modulo, eventoId = '', acao, resumo }, customDb = db) {
  const payload = {
    dataHora: formatarDataHoraBR(),
    usuario: String(usuario || 'sistema'),
    modulo: String(modulo || 'Geral'),
    eventoId: String(eventoId || ''),
    acao: String(acao || ''),
    resumo: String(resumo || '')
  };
  await customDb.ref('/auditoria').push(payload);
  return payload;
}

async function recalcularTodaProdutora(produtoraId, preloaded = null, customDb = db) {
  const [
    prodSnap,
    eventosSnap,
    eventosFinSnap,
    negSnap,
    locaisSnap,
    despSnap,
    advSnap,
    antSnap,
    repSnap,
    cfgTransfSnap
  ] = await Promise.all([
    customDb.ref(`/produtoras/${produtoraId}`).get(),
    customDb.ref('/eventos').orderByChild('produtoraId').equalTo(produtoraId).get(),
    customDb.ref('/eventos_fin').get(),
    customDb.ref('/negociacoes').get(),
    preloaded ? Promise.resolve({ val: () => preloaded.locais }) : customDb.ref('/locais').get(),
    preloaded ? Promise.resolve({ val: () => preloaded.despesas }) : customDb.ref('/despesas').get(),
    preloaded ? Promise.resolve({ val: () => preloaded.advanced }) : customDb.ref('/advanced').get(),
    preloaded ? Promise.resolve({ val: () => preloaded.antecipacoes }) : customDb.ref('/antecipacoes').get(),
    customDb.ref('/repasses').orderByChild('produtoraId').equalTo(produtoraId).get(),
    customDb.ref('/config/transferencia').get()
  ]);

  const produtora = prodSnap.val() || {};
  const eventosMap = eventosSnap.val() || {};
  const eventosFinMap = eventosFinSnap.val() || {};
  const negMap = negSnap.val() || {};
  const locaisMap = locaisSnap.val() || {};
  const despesasList = Object.values(despSnap.val() || {});
  const advancedMap = advSnap.val() || {};
  const advancedList = Object.entries(advancedMap)
    .map(([id, a]) => ({ id, ...a }))
    .filter(a => a.produtoraId === produtoraId);
  const antecipacoesMap = antSnap.val() || {};
  const antecipacoesList = Object.entries(antecipacoesMap)
    .map(([id, a]) => ({ id, ...a }))
    .filter(a => a.produtoraId === produtoraId);
  const repassesMap = repSnap.val() || {};
  const repassesList = Object.entries(repassesMap).map(([id, r]) => ({ id, ...r }));
  const cfgTransferencia = cfgTransfSnap.val() || { pixValor: 0, tedValor: 10 };

  const updates = {};
  const eventosCalculados = [];

  for (const [evId, evData] of Object.entries(eventosMap)) {
    const ev = { id: evId, ...evData };
    const fin = eventosFinMap[evId] || {};
    const neg = negMap[evId] || {};
    const loc = locaisMap[ev.localId] || {};
    const despEv = despesasList.filter(d => d.eventoId === evId);
    const advEv = advancedList.filter(a => a.escopo === evId);
    const antEv = antecipacoesList.filter(a => a.eventoId === evId);

    const calc = calcEvento(ev, fin, neg, despEv, advEv, antEv, loc);
    const borderoLimpo = bordero_produtor(calc);

    updates[`/borderos_produtor/${produtoraId}/${evId}`] = borderoLimpo;
    eventosCalculados.push({
      id: evId,
      nome: ev.nome,
      liberadoParaSolicitacao: Boolean(ev.liberadoParaSolicitacao),
      regraVigente: fin.regra || {},
      ...calc
    });
  }

  const cons = calcConsolidado(produtora, eventosCalculados, advancedList);

  updates[`/borderos_produtor/${produtoraId}/_consolidado`] = {
    liberavelEventos: cons.liberavelEventos,
    patrocinioProdutora: cons.patrocinioProdutora,
    patrocinioDescricao: (produtora.patrocinio && produtora.patrocinio.descricao) || 'Patrocínio da produtora',
    advConsolidado: cons.advConsolidado,
    devedores: cons.devedores,
    saldoDisponivel: cons.saldoDisponivel,
    tarifaPix: Number(cfgTransferencia.pixValor || 0),
    tarifaTed: Number(cfgTransferencia.tedValor !== undefined ? cfgTransferencia.tedValor : 10),
    atualizadoEm: formatarDataHoraBR()
  };

  if (typeof calcSaldoProdutora === 'function') {
    const saldoPos = calcSaldoProdutora({
      produtoraId,
      produtora,
      eventosCalculados,
      consolidado: cons,
      repasses: repassesList,
      antecipacoes: antecipacoesList,
      advanced: advancedList
    });
    updates[`/saldos/${produtoraId}`] = {
      ...saldoPos,
      atualizadoEm: formatarDataHoraBR()
    };
    if (typeof extrato_produtor === 'function') {
      updates[`/extrato_produtor/${produtoraId}`] = {
        ...extrato_produtor(saldoPos, repassesList),
        atualizadoEm: formatarDataHoraBR()
      };
    }
  }

  await customDb.ref().update(updates);
  logger.info(`[recalcularTodaProdutora] Produtora ${produtoraId} recalculada com sucesso.`, {
    saldoDisponivel: cons.saldoDisponivel
  });

  return {
    produtora,
    eventosCalculados,
    cons,
    advancedList,
    antecipacoesList,
    repassesList,
    cfgTransferencia
  };
}

async function processarRecalculoProdutoraPorEvento(eventoId, customDb = db) {
  if (!eventoId) return null;

  const [evSnap, locaisSnap, despSnap, advSnap, antSnap] = await Promise.all([
    customDb.ref(`/eventos/${eventoId}`).get(),
    customDb.ref('/locais').get(),
    customDb.ref('/despesas').get(),
    customDb.ref('/advanced').get(),
    customDb.ref('/antecipacoes').get()
  ]);

  if (!evSnap.exists()) {
    logger.info(`[recalcularEvento] Evento ${eventoId} removido ou inexistente.`);
    return null;
  }

  const evento = { id: eventoId, ...evSnap.val() };
  const produtoraId = evento.produtoraId;
  if (!produtoraId) return null;

  return recalcularTodaProdutora(
    produtoraId,
    {
      locais: locaisSnap.val() || {},
      despesas: despSnap.val() || {},
      advanced: advSnap.val() || {},
      antecipacoes: antSnap.val() || {}
    },
    customDb
  );
}

module.exports = {
  db,
  logger,
  httpsV2,
  databaseV2,
  functionsV2,
  toCents,
  fromCents,
  round2,
  formatarDataHoraBR,
  obterDataAtualBR,
  obterCompetenciaAtualBR,
  extrairCompetencia,
  competenciaEstaFechada,
  PLANO_CONTAS,
  registrarAuditoria,
  recalcularTodaProdutora,
  processarRecalculoProdutoraPorEvento,
  calcTransferencia,
  calcularRateioRepasse,
  somarDiasUteis,
  calcFluxoCaixa,
  gerarTitulosEvento,
  baixarTitulo,
  criarLancamentoPartidaDobrada,
  gerarEstornoLancamento,
  ROLES_SISTEMA,
  ROLES_PAINEL_INTERNO,
  MATRIZ_PERMISSOES,
  extrairPapelEfetivo,
  possuiAcessoPainelInterno,
  temPermissao,
  avaliarAlcadaDuplaAprovacao,
  criarEventoDominio,
  publicarEventoDominio
};
