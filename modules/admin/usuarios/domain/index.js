/**
 * Domínio Puro — Módulo Usuários, Papéis (RBAC) e Alçadas (admin/usuarios)
 * - Valida atribuição de Custom Claims (`role` + `subRole` para equipe interna ou `role: 'produtor' + produtoraId`)
 * - Bloqueia auto-alteração de papel (segregação de funções: operador não altera seu próprio perfil)
 * - Valida configuração de alçada de dupla aprovação (/config/alcada)
 */
'use strict';

const { PAPEIS_VALIDOS } = require('../contract');

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function construirCustomClaimsERP({ papel, produtoraId = null }) {
  if (!PAPEIS_VALIDOS.has(papel)) {
    throw new Error(`Papel "${papel}" inválido. Use um dos perfis: ${Array.from(PAPEIS_VALIDOS).join(', ')}.`);
  }

  if (papel === 'produtor') {
    const pid = String(produtoraId || '').trim();
    if (!pid) {
      throw new Error('Para atribuir o papel "produtor", o campo produtoraId é obrigatório.');
    }
    return {
      role: 'produtor',
      subRole: 'produtor',
      produtoraId: pid
    };
  }

  if (produtoraId) {
    throw new Error(`Perfis internos ("${papel}") não podem estar vinculados a um produtoraId específico.`);
  }

  // Perfis internos recebem role='financeiro' para compatibilidade com as regras RTDB + subRole granular
  return {
    role: 'financeiro',
    subRole: papel
  };
}

function validarAtribuicaoPapelERP(dados = {}, contexto = {}) {
  const { executorUid = '', produtoras = {}, usuarioExistente = null } = contexto;
  const uid = String(dados.uid || '').trim();
  const email = String(dados.email || '').trim().toLowerCase();
  const nome = String(dados.nome || email.split('@')[0] || '').trim();
  const papel = String(dados.papel || '').trim();
  const produtoraId = dados.produtoraId ? String(dados.produtoraId).trim() : null;
  const motivo = String(dados.motivo || '').trim();
  const ativo = dados.ativo !== undefined ? Boolean(dados.ativo) : true;

  if (!uid || uid.length < 3) {
    throw new Error('O uid do usuário é obrigatório (mínimo 3 caracteres).');
  }
  if (!email || !email.includes('@')) {
    throw new Error('Informe um e-mail válido para o usuário.');
  }
  if (executorUid && executorUid === uid) {
    throw new Error(
      'Segregação de funções: um usuário não pode alterar seu próprio papel ou status de acesso no ERP.'
    );
  }
  if (motivo.length < 3) {
    throw new Error('Informe obrigatoriamente o motivo da atribuição/alteração de papel (mínimo 3 caracteres).');
  }

  if (papel === 'produtor') {
    if (!produtoraId || !produtoras[produtoraId]) {
      throw new Error(`Produtora "${produtoraId || ''}" não encontrada no cadastro mestre.`);
    }
    if (produtoras[produtoraId].ativo === false) {
      throw new Error(`Não é permitido vincular usuário à produtora inativa "${produtoraId}".`);
    }
  }

  const customClaims = ativo
    ? construirCustomClaimsERP({ papel, produtoraId })
    : { role: 'suspenso', subRole: papel };

  const versao = Number((usuarioExistente && usuarioExistente.versao) || 0) + 1;

  return {
    uid,
    email,
    nome,
    papel,
    produtoraId: papel === 'produtor' ? produtoraId : null,
    ativo,
    status: ativo ? 'Ativo' : 'Suspenso',
    versao,
    motivo,
    customClaims
  };
}

function validarConfiguracaoAlcada(dados = {}) {
  const ativo = dados.ativo !== undefined ? Boolean(dados.ativo) : true;
  const limiteCents = toCents(dados.limiteDuplaAprovacaoReais);
  if (!Number.isFinite(limiteCents) || limiteCents < 0) {
    throw new Error('O limite de dupla aprovação (limiteDuplaAprovacaoReais) deve ser um valor >= 0.');
  }
  const motivo = String(dados.motivo || '').trim();
  if (motivo.length < 5) {
    throw new Error('Informe obrigatoriamente o motivo para alterar a alçada de dupla aprovação (mínimo 5 caracteres).');
  }

  return {
    ativo,
    limiteDuplaAprovacaoCents: limiteCents,
    limiteDuplaAprovacaoReais: fromCents(limiteCents),
    motivo
  };
}

module.exports = {
  construirCustomClaimsERP,
  validarAtribuicaoPapelERP,
  validarConfiguracaoAlcada
};
