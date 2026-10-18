/**
 * Shared Firebase Admin, Auditoria e Recálculo — Cloud Functions (southamerica-east1)
 */

'use strict';

const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const path = require('node:path');
const fs = require('node:fs');

const motorPath = fs.existsSync(path.resolve(__dirname, '../../../../packages/motor-repasse/src/index.js'))
  ? path.resolve(__dirname, '../../../../packages/motor-repasse/src/index.js')
  : path.resolve(__dirname, '../../../../motorRepasse.js');

const {
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

async function registrarAuditoria({ usuario, modulo, eventoId = '', acao, resumo }) {
  const payload = {
    dataHora: formatarDataHoraBR(),
    usuario: String(usuario || 'sistema'),
    modulo: String(modulo || 'Geral'),
    eventoId: String(eventoId || ''),
    acao: String(acao || ''),
    resumo: String(resumo || '')
  };
  await db.ref('/auditoria').push(payload);
  return payload;
}

async function recalcularTodaProdutora(produtoraId, preloaded = null) {
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
    db.ref(`/produtoras/${produtoraId}`).get(),
    db.ref('/eventos').orderByChild('produtoraId').equalTo(produtoraId).get(),
    db.ref('/eventos_fin').get(),
    db.ref('/negociacoes').get(),
    preloaded ? Promise.resolve({ val: () => preloaded.locais }) : db.ref('/locais').get(),
    preloaded ? Promise.resolve({ val: () => preloaded.despesas }) : db.ref('/despesas').get(),
    preloaded ? Promise.resolve({ val: () => preloaded.advanced }) : db.ref('/advanced').get(),
    preloaded ? Promise.resolve({ val: () => preloaded.antecipacoes }) : db.ref('/antecipacoes').get(),
    db.ref('/repasses').orderByChild('produtoraId').equalTo(produtoraId).get(),
    db.ref('/config/transferencia').get()
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

  // Atualiza posição de Saldo (/saldos/{produtoraId}) e projeção limpa (/extrato_produtor/{produtoraId})
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

  await db.ref().update(updates);
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

async function processarRecalculoProdutoraPorEvento(eventoId) {
  if (!eventoId) return null;

  const [evSnap, locaisSnap, despSnap, advSnap, antSnap] = await Promise.all([
    db.ref(`/eventos/${eventoId}`).get(),
    db.ref('/locais').get(),
    db.ref('/despesas').get(),
    db.ref('/advanced').get(),
    db.ref('/antecipacoes').get()
  ]);

  if (!evSnap.exists()) {
    logger.info(`[recalcularEvento] Evento ${eventoId} removido ou inexistente.`);
    return null;
  }

  const evento = { id: eventoId, ...evSnap.val() };
  const produtoraId = evento.produtoraId;
  if (!produtoraId) return null;

  return recalcularTodaProdutora(produtoraId, {
    locais: locaisSnap.val() || {},
    despesas: despSnap.val() || {},
    advanced: advSnap.val() || {},
    antecipacoes: antSnap.val() || {}
  });
}

module.exports = {
  db,
  logger,
  formatarDataHoraBR,
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
  gerarEstornoLancamento
};
