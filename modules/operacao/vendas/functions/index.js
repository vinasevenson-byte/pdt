/**
 * Cloud Function Handler — Módulo Operação de Vendas, Lotes e Cortesias (operacao/vendas)
 * - `registrarLoteVendasBordero`: ingestão idempotente de lotes de vendas e cortesias,
 *   atualização transacional de `/eventos/{eventoId}` (`vendas.vendidos`, `vendas.cortesias`, `bilheteria`),
 *   provisão de título em `/contas_receber/cr_vnd_{loteId}` e recálculo automático do borderô e saldos.
 */
'use strict';

const {
  db: defaultDb,
  httpsV2,
  toCents,
  fromCents,
  formatarDataHoraBR,
  registrarAuditoria,
  recalcularTodaProdutora,
  temPermissao,
  publicarEventoDominio,
  calcularCapacidadeEContadosEvento
} = require('../../../../services/functions/src/shared/recalculo');
const { validarVendas } = require('../contract');
const { validarIngestaoVendasLote } = require('../domain');
const { onCall, HttpsError } = httpsV2;

async function executarRegistrarLoteVendasBordero(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'vendas:gerenciar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "vendas:gerenciar" podem registrar lotes de vendas e cortesias.'
    );
  }

  const dados = request.data || {};
  const eventoId = String(dados.eventoId || '').trim();
  if (!eventoId) {
    throw new HttpsError('invalid-argument', 'O identificador do evento (eventoId) é obrigatório.');
  }

  const [evSnap, lotesSnap] = await Promise.all([
    db.ref(`/eventos/${eventoId}`).get(),
    db.ref('/vendas_lotes').get()
  ]);

  const eventoExistente = evSnap.exists() ? evSnap.val() : null;
  if (!eventoExistente) {
    throw new HttpsError('failed-precondition', `Evento "${eventoId}" não encontrado.`);
  }

  const [prodSnap, locSnap] = await Promise.all([
    db.ref(`/produtoras/${eventoExistente.produtoraId}`).get(),
    db.ref(`/locais/${eventoExistente.localId}`).get()
  ]);

  const produtoraExistente = prodSnap.exists() ? prodSnap.val() : null;
  const localExistente = locSnap.exists() ? locSnap.val() : null;
  const lotesExistentes = lotesSnap.val() || {};

  let validado;
  try {
    validado = validarIngestaoVendasLote(dados, {
      eventoExistente,
      produtoraExistente,
      localExistente,
      lotesExistentes
    });
  } catch (err) {
    const ehConflito = err.message.includes('idempotência') || err.message.includes('capacidade') || err.message.includes('inativ') || err.message.includes('aberto');
    throw new HttpsError(ehConflito ? 'failed-precondition' : 'invalid-argument', err.message);
  }

  if (validado.idempotente) {
    return {
      idempotente: true,
      loteId: validado.loteId,
      eventoId: validado.eventoId,
      produtoraId: validado.produtoraId,
      hashLoteSha256: validado.hashLoteSha256,
      registroLote: validado.registroLote
    };
  }

  const usuario = auth.token.email || auth.uid;
  const dataHora = formatarDataHoraBR(nowDate);
  const { loteId, produtoraId, registroLote, tituloReceber } = validado;

  // Atualização transacional do evento para nunca sobrescrever vendas ou repasses concorrentes
  const evRef = db.ref(`/eventos/${eventoId}`);
  let erroTx = null;
  let vendasAposTx = null;

  if (typeof evRef.transaction === 'function') {
    const tx = await evRef.transaction(current => {
      if (!current) return current;
      const vendAtuais = Number((current.vendas && current.vendas.vendidos) || 0);
      const cortAtuais = Number((current.vendas && current.vendas.cortesias) || 0);
      const bilAtualCents = toCents(current.bilheteria || 0);

      const atualizado = {
        ...current,
        vendas: {
          vendidos: vendAtuais + validado.quantidadeVendida,
          cortesias: cortAtuais + validado.quantidadeCortesias
        },
        bilheteria: fromCents(bilAtualCents + validado.valorBrutoCents),
        atualizadoPor: usuario,
        atualizadoEm: dataHora
      };

      const checkCap = calcularCapacidadeEContadosEvento(atualizado, localExistente || {});
      if (checkCap.ingressosContados > checkCap.capacidadeUsada) {
        erroTx = `Ultrapassa o teto de capacidade do evento "${eventoId}": ${checkCap.ingressosContados} > ${checkCap.capacidadeUsada}.`;
        return;
      }

      vendasAposTx = {
        vendidos: atualizado.vendas.vendidos,
        cortesias: atualizado.vendas.cortesias,
        bilheteria: atualizado.bilheteria
      };
      return atualizado;
    });

    if (erroTx || !tx.committed) {
      throw new HttpsError('failed-precondition', erroTx || 'Conflito transacional ao atualizar vendas do evento.');
    }
  } else {
    await evRef.update({
      vendas: {
        vendidos: validado.novosVendidos,
        cortesias: validado.novasCortesias
      },
      bilheteria: validado.novaBilheteria,
      atualizadoPor: usuario,
      atualizadoEm: dataHora
    });
    vendasAposTx = {
      vendidos: validado.novosVendidos,
      cortesias: validado.novasCortesias,
      bilheteria: validado.novaBilheteria
    };
  }

  const loteComMeta = {
    ...registroLote,
    registradoPor: usuario,
    registradoEm: dataHora
  };

  const updates = {
    [`/vendas_lotes/${loteId}`]: loteComMeta
  };
  if (tituloReceber) {
    updates[`/contas_receber/${tituloReceber.id}`] = {
      ...tituloReceber,
      criadoPor: usuario,
      criadoEm: dataHora
    };
  }

  await db.ref().update(updates);
  await recalcularTodaProdutora(produtoraId, null, db);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'operacao/vendas',
      eventoId,
      acao: 'Ingestão de Lote de Vendas/Cortesias',
      resumo: `Lote ${loteId} (${registroLote.nomeLote} / ${registroLote.setor}): +${validado.quantidadeVendida} vendidos, +${validado.quantidadeCortesias} cortesias, +R$ ${validado.valorBruto.toFixed(2)} (${registroLote.meioPagamento}).`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: 'LoteVendasRegistrado',
    origemModulo: 'operacao/vendas',
    referenciaId: loteId,
    produtoraId,
    eventoId,
    payload: {
      loteId,
      eventoId,
      quantidadeVendida: validado.quantidadeVendida,
      quantidadeCortesias: validado.quantidadeCortesias,
      valorBrutoCents: validado.valorBrutoCents,
      vendasAcumuladas: vendasAposTx
    }
  });

  return {
    idempotente: false,
    loteId,
    eventoId,
    produtoraId,
    hashLoteSha256: validado.hashLoteSha256,
    vendasAcumuladas: vendasAposTx,
    registroLote: loteComMeta,
    tituloReceberId: tituloReceber ? tituloReceber.id : null
  };
}

exports.registrarLoteVendasBordero = onCall(request => executarRegistrarLoteVendasBordero(request));
exports.executarRegistrarLoteVendasBordero = executarRegistrarLoteVendasBordero;

exports.processar_operacao_vendas = onCall(async request => {
  if (request.data && request.data.eventoId) {
    return executarRegistrarLoteVendasBordero(request);
  }
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Acesso restrito ao perfil Financeiro.');
  }

  const validacao = validarVendas(request.data || {});
  if (!validacao.valido) {
    throw new HttpsError('invalid-argument', validacao.erros.join(' '));
  }

  return { ok: true, id: 'operacao/vendas', no: 'vendas_lotes' };
});
