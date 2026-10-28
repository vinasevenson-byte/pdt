/**
 * Cloud Function Handler — Módulo Fornecedores e Compras Operacionais (admin/fornecedores)
 * - `lancarDespesaOperacionalEvento`: cadastra/atualiza fornecedor em `/fornecedores_op`, grava despesa em `/despesas`,
 *   provisiona título em `/contas_pagar` e recalcula imediatamente o borderô e os saldos da produtora.
 */
'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  registrarAuditoria,
  recalcularTodaProdutora,
  temPermissao,
  publicarEventoDominio
} = require('../../../../services/functions/src/shared/recalculo');
const { validarLancamentoDespesaFornecedor } = require('../domain');
const { onCall, HttpsError } = httpsV2;

async function executarLancarDespesaOperacionalEvento(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || (!temPermissao(auth.token, 'fornecedores:gerenciar') && !temPermissao(auth.token, 'despesas:gerenciar'))) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "fornecedores:gerenciar" ou "despesas:gerenciar" podem lançar despesas operacionais.'
    );
  }

  const dados = request.data || {};
  const eventoId = String(dados.eventoId || '').trim();
  if (!eventoId) {
    throw new HttpsError('invalid-argument', 'O campo eventoId é obrigatório.');
  }

  const evSnap = await db.ref(`/eventos/${eventoId}`).get();
  const eventoExistente = evSnap.exists() ? evSnap.val() : null;

  let validado;
  try {
    validado = validarLancamentoDespesaFornecedor(dados, { eventoExistente });
  } catch (err) {
    const ehPrecond = err.message.includes('não encontrado') || err.message.includes('inativo');
    throw new HttpsError(ehPrecond ? 'failed-precondition' : 'invalid-argument', err.message);
  }

  const usuario = auth.token.email || auth.uid;
  const dataHora = formatarDataHoraBR(nowDate);

  const updates = {
    [`/fornecedores_op/${validado.fornecedorId}`]: {
      ...validado.registroFornecedor,
      atualizadoPor: usuario,
      atualizadoEm: dataHora
    },
    [`/despesas/${validado.despesaId}`]: {
      ...validado.registroDespesa,
      criadoPor: usuario,
      criadoEm: dataHora
    },
    [`/contas_pagar/${validado.tituloPagar.id}`]: {
      ...validado.tituloPagar,
      criadoPor: usuario,
      criadoEm: dataHora
    }
  };

  await db.ref().update(updates);
  await recalcularTodaProdutora(validado.produtoraId, null, db);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'admin/fornecedores',
      eventoId,
      acao: 'Lançamento de Despesa Operacional de Borderô',
      resumo: `Despesa ${validado.despesaId} (${validado.registroDespesa.descricao} — R$ ${validado.valor.toFixed(2)}, ${validado.registroDespesa.status}) lançada para ${eventoId} (fornecedor: ${validado.registroFornecedor.nome}).`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: 'DespesaOperacionalLancada',
    origemModulo: 'admin/fornecedores',
    referenciaId: validado.despesaId,
    produtoraId: validado.produtoraId,
    eventoId,
    payload: {
      despesaId: validado.despesaId,
      fornecedorId: validado.fornecedorId,
      valorCents: validado.valorCents,
      status: validado.registroDespesa.status
    }
  });

  return {
    despesaId: validado.despesaId,
    fornecedorId: validado.fornecedorId,
    tituloPagarId: validado.tituloPagar.id,
    eventoId,
    produtoraId: validado.produtoraId,
    valorCents: validado.valorCents,
    valor: validado.valor,
    status: validado.registroDespesa.status
  };
}

exports.lancarDespesaOperacionalEvento = onCall(request => executarLancarDespesaOperacionalEvento(request));
exports.executarLancarDespesaOperacionalEvento = executarLancarDespesaOperacionalEvento;
exports.processar_admin_fornecedores = onCall(request => executarLancarDespesaOperacionalEvento(request));
