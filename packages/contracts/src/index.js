/**
 * @diskingressos/contracts
 * Schemas e validadores compartilhados para nós do Firebase Realtime Database.
 */

'use strict';

const { validarLancamento, RTDB_NODE_LANCAMENTOS, RTDB_NODE_FECHAMENTOS } = require('./ledger');
const { validarContaPagar, STATUS_TITULO_PAGAR } = require('./contas_pagar');
const { validarContaReceber, STATUS_TITULO_RECEBER } = require('./contas_receber');
const { validarSaldoProdutora, RTDB_NODE_SALDOS, RTDB_NODE_EXTRATO_PRODUTOR } = require('./saldos');
const { validarFluxoCaixaSnapshot } = require('./fluxo_caixa');

const FORMAS_TRANSFERENCIA = ['PIX', 'TED'];
const STATUS_REPASSE = ['Solicitado', 'Aprovado', 'Pago', 'Recusado'];
const STATUS_ANTECIPACAO = ['Solicitada', 'Aprovada', 'Paga', 'Recusada'];
const STATUS_CONTA = ['Pendente', 'Validada', 'Recusada'];
const STATUS_DESPESA = ['Pago', 'A pagar'];
const STATUS_TITULO = ['Prevista', 'Aprovada', 'Paga', 'Recebida', 'Cancelada', 'Vencida'];

function validarSolicitacaoRepasse(payload = {}) {
  const erros = [];
  if (!payload.produtoraId || typeof payload.produtoraId !== 'string') {
    erros.push('produtoraId obrigatório.');
  }
  if (!Array.isArray(payload.eventoIds) || payload.eventoIds.length === 0) {
    erros.push('Selecione ao menos um evento (eventoIds).');
  }
  if (!FORMAS_TRANSFERENCIA.includes(payload.forma)) {
    erros.push('Forma de pagamento inválida (use PIX ou TED).');
  }
  if (typeof payload.valor !== 'number' || !Number.isFinite(payload.valor) || payload.valor <= 0) {
    erros.push('Valor solicitado deve ser numérico e maior que zero.');
  }
  if (!payload.contaId || typeof payload.contaId !== 'string') {
    erros.push('contaId obrigatório.');
  }
  return {
    valido: erros.length === 0,
    erros
  };
}

function validarRegistroAuditoria(entry = {}) {
  const erros = [];
  for (const campo of ['dataHora', 'usuario', 'modulo', 'acao', 'resumo']) {
    if (!entry[campo] || typeof entry[campo] !== 'string') {
      erros.push(`Campo obrigatório de auditoria ausente: ${campo}`);
    }
  }
  return {
    valido: erros.length === 0,
    erros
  };
}

module.exports = {
  FORMAS_TRANSFERENCIA,
  STATUS_REPASSE,
  STATUS_ANTECIPACAO,
  STATUS_CONTA,
  STATUS_DESPESA,
  STATUS_TITULO,
  STATUS_TITULO_PAGAR,
  STATUS_TITULO_RECEBER,
  RTDB_NODE_LANCAMENTOS,
  RTDB_NODE_FECHAMENTOS,
  RTDB_NODE_SALDOS,
  RTDB_NODE_EXTRATO_PRODUTOR,
  validarSolicitacaoRepasse,
  validarRegistroAuditoria,
  validarLancamento,
  validarContaPagar,
  validarContaReceber,
  validarSaldoProdutora,
  validarFluxoCaixaSnapshot
};
