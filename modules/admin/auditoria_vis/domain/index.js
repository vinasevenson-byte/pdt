/**
 * Domínio Puro — Módulo Visualizador de Auditoria e Assinaturas Eletrônicas (admin/auditoria_vis)
 * - Filtra e correlaciona registros de `/auditoria` por módulo, usuário, eventoId e termo textual
 * - Verifica integridade de assinaturas eletrônicas de aceite em `/repasses` (`aceiteAssinatura` / `assinaturaEletronica`)
 * - Gera selo SHA-256 do relatório de conformidade para trilha de auditoria externa
 */
'use strict';

const crypto = require('node:crypto');

function filtrarTrilhaAuditoria(auditoriaMap = {}, filtros = {}) {
  const moduloFiltro = String(filtros.modulo || '').trim().toLowerCase();
  const usuarioFiltro = String(filtros.usuario || '').trim().toLowerCase();
  const eventoIdFiltro = String(filtros.eventoId || '').trim().toLowerCase();
  const buscaTexto = String(filtros.textoBusca || '').trim().toLowerCase();

  const lista = Object.entries(auditoriaMap || {}).map(([id, item]) => ({
    id,
    dataHora: String((item && item.dataHora) || ''),
    usuario: String((item && item.usuario) || ''),
    modulo: String((item && item.modulo) || ''),
    eventoId: String((item && item.eventoId) || ''),
    acao: String((item && item.acao) || ''),
    resumo: String((item && item.resumo) || '')
  }));

  const filtrados = lista.filter(reg => {
    if (moduloFiltro && !reg.modulo.toLowerCase().includes(moduloFiltro)) return false;
    if (usuarioFiltro && !reg.usuario.toLowerCase().includes(usuarioFiltro)) return false;
    if (eventoIdFiltro && reg.eventoId.toLowerCase() !== eventoIdFiltro) return false;
    if (buscaTexto) {
      const alvo = `${reg.modulo} ${reg.usuario} ${reg.eventoId} ${reg.acao} ${reg.resumo}`.toLowerCase();
      if (!alvo.includes(buscaTexto)) return false;
    }
    return true;
  });

  const contagemPorModulo = {};
  for (const r of filtrados) {
    const m = r.modulo || 'Geral';
    contagemPorModulo[m] = (contagemPorModulo[m] || 0) + 1;
  }

  return {
    totalRegistros: lista.length,
    totalFiltrados: filtrados.length,
    contagemPorModulo,
    registros: filtrados
  };
}

function verificarIntegridadeAssinaturasRepasses(repassesMap = {}) {
  const repasses = Object.entries(repassesMap || {}).map(([id, r]) => ({ id, ...(r || {}) }));
  const comAssinaturaCompleta = [];
  const legadoSemMetadadosAssinatura = [];

  for (const r of repasses) {
    const ass = r.assinaturaEletronica || r.aceiteAssinatura || null;
    const possuiAssinatura = Boolean(
      ass &&
        typeof ass === 'object' &&
        (ass.aceito === true || ass.termoAceito === true) &&
        (ass.ip || ass.userAgent || ass.dataHora || ass.timestamp)
    );

    if (possuiAssinatura) {
      comAssinaturaCompleta.push({
        repasseId: r.id,
        produtoraId: r.produtoraId,
        status: r.status,
        valorSolicitado: Number(r.valorSolicitado || 0),
        assinadoPor: ass.email || ass.uid || r.produtoraId,
        dataHoraAssinatura: ass.dataHora || ass.timestamp || r.solicitadoEm || ''
      });
    } else {
      legadoSemMetadadosAssinatura.push({
        repasseId: r.id,
        produtoraId: r.produtoraId,
        status: r.status,
        valorSolicitado: Number(r.valorSolicitado || 0)
      });
    }
  }

  const canonic = JSON.stringify({
    totalRepasses: repasses.length,
    comAssinaturaCompleta: comAssinaturaCompleta.map(x => x.repasseId).sort(),
    legadoSemMetadadosAssinatura: legadoSemMetadadosAssinatura.map(x => x.repasseId).sort()
  });
  const seloConformidadeSha256 = crypto.createHash('sha256').update(canonic).digest('hex');

  return {
    totalRepassesAnalisados: repasses.length,
    qtdComAssinaturaCompleta: comAssinaturaCompleta.length,
    qtdLegadoSemAssinatura: legadoSemMetadadosAssinatura.length,
    comAssinaturaCompleta,
    legadoSemMetadadosAssinatura,
    seloConformidadeSha256
  };
}

module.exports = {
  filtrarTrilhaAuditoria,
  verificarIntegridadeAssinaturasRepasses
};
