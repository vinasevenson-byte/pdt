/**
 * Domínio Puro (em centavos) — Módulo Fornecedores e Compras Operacionais (admin/fornecedores)
 * - Valida cadastro de fornecedor operacional (CNPJ com dígito verificador ou CPF)
 * - Valida lançamento de despesa direta do evento (/despesas) vinculada a fornecedor e NF
 * - Gera título correspondente em /contas_pagar (`cp_desp_{despesaId}`)
 */
'use strict';

const {
  validarDigitosCnpj,
  normalizarCnpj,
  formatarCnpj,
  validarIdCadastro,
  gerarIdCadastro
} = require('../../../../packages/motor-repasse/src/index.js');

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function validarLancamentoDespesaFornecedor(dados = {}, contexto = {}) {
  const { eventoExistente = null } = contexto;
  const eventoId = String(dados.eventoId || '').trim();
  if (!eventoId) {
    throw new Error('O identificador do evento (eventoId) é obrigatório.');
  }
  if (!eventoExistente) {
    throw new Error(`Evento "${eventoId}" não encontrado no cadastro mestre.`);
  }
  if (eventoExistente.ativo === false) {
    throw new Error(`Não é permitido lançar despesa operacional no evento inativo "${eventoId}".`);
  }

  const descricao = String(dados.descricao || '').trim();
  if (descricao.length < 3) {
    throw new Error('A descrição da despesa operacional deve ter ao menos 3 caracteres.');
  }

  const valorCents = toCents(dados.valor);
  if (!Number.isFinite(valorCents) || valorCents <= 0) {
    throw new Error('O valor da despesa operacional deve ser positivo (> R$ 0,00).');
  }

  const fornecedorNome = String(dados.fornecedorNome || 'Fornecedor Operacional').trim();
  const cnpjFornecedor = dados.cnpjFornecedor ? normalizarCnpj(dados.cnpjFornecedor) : '';
  if (cnpjFornecedor && !validarDigitosCnpj(cnpjFornecedor)) {
    throw new Error(`CNPJ do fornecedor inválido (${dados.cnpjFornecedor}): dígitos verificadores não conferem.`);
  }

  const idInformado = dados.despesaId ? String(dados.despesaId).trim() : '';
  if (idInformado && !validarIdCadastro(idInformado)) {
    throw new Error(`Identificador de despesa inválido ("${idInformado}"). Use apenas [a-z0-9_].`);
  }
  const despesaId = idInformado || gerarIdCadastro('desp', `${eventoId}_${descricao}`);
  const fornecedorId = dados.fornecedorId
    ? String(dados.fornecedorId).trim()
    : gerarIdCadastro('forn', fornecedorNome);

  const statusDespesa = dados.status === 'Pago' ? 'Pago' : 'A pagar';
  const comNota = Boolean(dados.comNota);
  const numeroNota = String(dados.numeroNota || '').trim();
  if (comNota && !numeroNota) {
    throw new Error('Quando comNota=true, informe obrigatoriamente o numeroNota da Nota Fiscal.');
  }

  const produtoraId = String(eventoExistente.produtoraId || '');

  const registroFornecedor = {
    id: fornecedorId,
    nome: fornecedorNome,
    documento: cnpjFornecedor ? formatarCnpj(cnpjFornecedor) : 'ISENTO/PF',
    chavePix: String(dados.chavePix || '').trim(),
    status: 'Ativo'
  };

  const registroDespesa = {
    id: despesaId,
    produtoraId,
    eventoId,
    fornecedorId,
    fornecedorNome,
    descricao,
    valorCents,
    valor: fromCents(valorCents),
    status: statusDespesa,
    comNota,
    numeroNota: comNota ? numeroNota : ''
  };

  const tituloPagar = {
    id: `cp_desp_${despesaId}`,
    produtoraId,
    eventoId,
    origemId: despesaId,
    fornecedorId,
    favorecido: fornecedorNome,
    categoria: 'despesa_evento',
    descricao: `Despesa de Borderô (${eventoId}): ${descricao}`,
    valorCents,
    valor: fromCents(valorCents),
    valorOriginal: fromCents(valorCents),
    status: statusDespesa === 'Pago' ? 'Paga' : 'Pendente'
  };

  return {
    despesaId,
    fornecedorId,
    eventoId,
    produtoraId,
    valorCents,
    valor: fromCents(valorCents),
    registroFornecedor,
    registroDespesa,
    tituloPagar
  };
}

module.exports = {
  validarLancamentoDespesaFornecedor
};
