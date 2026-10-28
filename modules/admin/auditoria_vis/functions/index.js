/**
 * Cloud Function Handler — Módulo Visualizador de Auditoria e Assinaturas (admin/auditoria_vis)
 */
'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  temPermissao
} = require('../../../../services/functions/src/shared/recalculo');
const {
  filtrarTrilhaAuditoria,
  verificarIntegridadeAssinaturasRepasses
} = require('../domain');
const { onCall, HttpsError } = httpsV2;

async function executarConsultarAuditoriaConsolidada(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'auditoria:ler')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "auditoria:ler" (financeiro, aprovador, fiscal, auditor) podem consultar a auditoria consolidada.'
    );
  }

  const filtros = request.data || {};
  const [audSnap, repSnap, domSnap] = await Promise.all([
    db.ref('/auditoria').get(),
    db.ref('/repasses').get(),
    db.ref('/eventos_dominio').get()
  ]);

  const trilha = filtrarTrilhaAuditoria(audSnap.val() || {}, filtros);
  const assinaturas = verificarIntegridadeAssinaturasRepasses(repSnap.val() || {});
  const eventosDominio = Object.keys(domSnap.val() || {}).length;
  const geradoEm = formatarDataHoraBR(nowDate);

  const relatorio = {
    geradoEm,
    geradoPor: auth.token.email || auth.uid,
    status: 'Consolidado',
    filtrosAplicados: {
      modulo: filtros.modulo || null,
      usuario: filtros.usuario || null,
      eventoId: filtros.eventoId || null,
      textoBusca: filtros.textoBusca || null
    },
    trilha,
    assinaturas,
    totalEventosDominioOutbox: eventosDominio
  };

  if (filtros.persistirSnapshot === true) {
    const idSnap = `rel_aud_${nowDate.getTime()}`;
    await db.ref(`/auditoria_relatorios/${idSnap}`).set(relatorio);
  }

  return relatorio;
}

exports.consultarAuditoriaConsolidada = onCall(request => executarConsultarAuditoriaConsolidada(request));
exports.executarConsultarAuditoriaConsolidada = executarConsultarAuditoriaConsolidada;
exports.processar_admin_auditoria_vis = onCall(request => executarConsultarAuditoriaConsolidada(request));
