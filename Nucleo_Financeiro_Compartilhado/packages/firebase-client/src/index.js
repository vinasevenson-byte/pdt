/**
 * @diskingressos/firebase-client
 * Configuração do projeto Firebase (diskingressos-62591), helpers de Custom Claims e auditoria.
 */

'use strict';

const FIREBASE_PROJECT_CONFIG = {
  projectId: 'diskingressos-62591',
  databaseURL: 'https://diskingressos-62591-default-rtdb.firebaseio.com',
  region: 'southamerica-east1'
};

function extrairClaims(tokenResult = {}) {
  const claims = tokenResult.claims || tokenResult || {};
  return {
    role: claims.role || null,
    produtoraId: claims.produtoraId || null,
    isFinanceiro: claims.role === 'financeiro',
    isProdutor: claims.role === 'produtor' && Boolean(claims.produtoraId)
  };
}

function criarPayloadAuditoria({ usuario, modulo, eventoId = '', acao, resumo }) {
  return {
    dataHora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    usuario: String(usuario || 'sistema'),
    modulo: String(modulo || 'Geral'),
    eventoId: String(eventoId || ''),
    acao: String(acao || ''),
    resumo: String(resumo || '')
  };
}

module.exports = {
  FIREBASE_PROJECT_CONFIG,
  extrairClaims,
  criarPayloadAuditoria
};
