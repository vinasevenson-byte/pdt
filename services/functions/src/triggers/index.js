/**
 * Triggers RTDB (`recalcularPor*`) — Cloud Functions v2
 */

'use strict';

const { onValueWritten } = require('firebase-functions/v2/database');
const {
  recalcularTodaProdutora,
  processarRecalculoProdutoraPorEvento
} = require('../shared/recalculo');

exports.recalcularPorEvento = onValueWritten('/eventos/{id}', async (event) => {
  await processarRecalculoProdutoraPorEvento(event.params.id);
});

exports.recalcularPorEventoFin = onValueWritten('/eventos_fin/{id}', async (event) => {
  await processarRecalculoProdutoraPorEvento(event.params.id);
});

exports.recalcularPorNegociacao = onValueWritten('/negociacoes/{id}', async (event) => {
  await processarRecalculoProdutoraPorEvento(event.params.id);
});

exports.recalcularPorDespesa = onValueWritten('/despesas/{id}', async (event) => {
  const val = event.data.after.val() || event.data.before.val();
  if (val && val.eventoId) {
    await processarRecalculoProdutoraPorEvento(val.eventoId);
  }
});

exports.recalcularPorAdvanced = onValueWritten('/advanced/{id}', async (event) => {
  const val = event.data.after.val() || event.data.before.val();
  if (val && val.produtoraId) {
    await recalcularTodaProdutora(val.produtoraId);
  }
});

exports.recalcularPorAntecipacao = onValueWritten('/antecipacoes/{id}', async (event) => {
  const val = event.data.after.val() || event.data.before.val();
  if (val && val.produtoraId) {
    await recalcularTodaProdutora(val.produtoraId);
  }
});
