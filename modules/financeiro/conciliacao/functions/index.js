/**
 * Cloud Functions Callables — Módulo Conciliação Bancária OFX (financeiro/conciliacao)
 * - importarExtratoOFX: faz parse de OFX 1.02/2.x, bloqueia arquivo duplicado (SHA-256), valida /fechamentos e concilia contra /lancamentos
 * - vincularItemConciliacao: pareamento manual de item pendente ou ambíguo por operador autorizado
 */
'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  obterCompetenciaAtualBR,
  competenciaEstaFechada,
  registrarAuditoria,
  temPermissao,
  publicarEventoDominio
} = require('../../../../services/functions/src/shared/recalculo');
const { parsearExtratoOFX, conciliarExtratoBancario } = require('../domain');

const { onCall, HttpsError } = httpsV2;

async function executarImportarExtratoOFX(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'painel:ler') || auth.token.role === 'produtor') {
    throw new HttpsError(
      'permission-denied',
      'Apenas operadores do Painel Financeiro podem importar extratos bancários OFX.'
    );
  }

  const { ofxConteudo, competencia: compForcada, produtoraId = 'disk_matriz' } = request.data || {};
  if (!ofxConteudo || typeof ofxConteudo !== 'string') {
    throw new HttpsError('invalid-argument', 'Informe o conteúdo do arquivo OFX em ofxConteudo.');
  }

  let parsed;
  try {
    parsed = parsearExtratoOFX(ofxConteudo);
  } catch (err) {
    throw new HttpsError('invalid-argument', err.message || 'Arquivo OFX inválido.');
  }

  const competencia = compForcada || parsed.competencia || obterCompetenciaAtualBR(nowDate);
  const [concSnap, fechSnap, lancSnap] = await Promise.all([
    customDb.ref('/conciliacoes').get(),
    customDb.ref('/fechamentos').get(),
    customDb.ref('/lancamentos').get()
  ]);

  const fechamentosMap = (fechSnap && fechSnap.val()) || {};
  if (competenciaEstaFechada(competencia, fechamentosMap)) {
    throw new HttpsError(
      'failed-precondition',
      `A competência ${competencia} está encerrada em /fechamentos e bloqueia novas conciliações bancárias.`
    );
  }

  const existentes = (concSnap && concSnap.val()) || {};
  const duplicado = Object.values(existentes).find(
    c => c && c.hashArquivo && c.hashArquivo === parsed.hashArquivo
  );
  if (duplicado) {
    throw new HttpsError(
      'already-exists',
      `Este extrato OFX já foi importado anteriormente (conciliação ${duplicado.id}, hash ${parsed.hashArquivo.slice(0, 12)}…).`
    );
  }

  const todosLanc = (lancSnap && lancSnap.val()) || {};
  const lancamentosCompetencia = Object.entries(todosLanc)
    .filter(([, l]) => l && l.competencia === competencia)
    .map(([id, l]) => ({ ...l, id: l.id || id }));

  const resultado = conciliarExtratoBancario({
    itensExtrato: parsed.transacoes,
    lancamentosLedger: lancamentosCompetencia
  });

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const refNovo = customDb.ref('/conciliacoes').push();

  const registro = {
    id: refNovo.key,
    produtoraId,
    competencia,
    banco: parsed.banco,
    hashArquivo: parsed.hashArquivo,
    quantidadeTransacoes: parsed.quantidadeTransacoes,
    status: resultado.conciliadoComSucesso ? 'Conciliada' : 'ComPendencias',
    resumo: {
      conciliados: resultado.conciliados.length,
      divergentesValor: resultado.divergentesValor.length,
      ambiguidades: resultado.ambiguidades.length,
      pendentesExtrato: resultado.pendentesExtrato.length,
      pendentesLedger: resultado.pendentesLedger.length,
      somaExtrato: resultado.somaExtrato,
      somaLedger: resultado.somaLedger,
      diferencaTotal: resultado.diferencaTotal
    },
    detalhes: resultado,
    importadoPor: usuario,
    importadoEm: agora
  };

  await refNovo.set(registro);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'financeiro/conciliacao',
      eventoId: competencia,
      acao: 'Importação e Conciliação de Extrato OFX',
      resumo: `Extrato OFX (${parsed.quantidadeTransacoes} transação(ões), competência ${competencia}) processado: ${resultado.conciliados.length} conciliado(s), ${resultado.divergentesValor.length} divergente(s), ${resultado.ambiguidades.length} ambíguo(s).`
    },
    customDb
  );

  await publicarEventoDominio(customDb, {
    tipo: 'financeiro.conciliacao.processado',
    origemModulo: 'financeiro/conciliacao',
    referenciaId: registro.id,
    produtoraId,
    payload: {
      competencia,
      status: registro.status,
      hashArquivo: parsed.hashArquivo
    }
  });

  return registro;
}

async function executarVincularItemConciliacao(request, deps = {}) {
  const customDb = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'painel:ler') || auth.token.role === 'produtor') {
    throw new HttpsError('permission-denied', 'Acesso restrito ao Financeiro.');
  }

  const { conciliacaoId, extratoId, lancamentoId, justificativa = '' } = request.data || {};
  if (!conciliacaoId || !extratoId || !lancamentoId) {
    throw new HttpsError('invalid-argument', 'Informe conciliacaoId, extratoId e lancamentoId.');
  }

  const [concSnap, lancSnap, fechSnap] = await Promise.all([
    customDb.ref(`/conciliacoes/${conciliacaoId}`).get(),
    customDb.ref(`/lancamentos/${lancamentoId}`).get(),
    customDb.ref('/fechamentos').get()
  ]);

  if (!concSnap.exists()) {
    throw new HttpsError('not-found', `Conciliação ${conciliacaoId} não encontrada.`);
  }
  if (!lancSnap.exists()) {
    throw new HttpsError('not-found', `Lançamento ${lancamentoId} não encontrado no Ledger.`);
  }

  const conc = concSnap.val();
  const lanc = { id: lancamentoId, ...lancSnap.val() };
  const fechamentosMap = (fechSnap && fechSnap.val()) || {};

  if (competenciaEstaFechada(conc.competencia, fechamentosMap)) {
    throw new HttpsError(
      'failed-precondition',
      `A competência ${conc.competencia} está fechada e não permite alterações na conciliação.`
    );
  }

  const detalhes = conc.detalhes || {};
  const ambiguidades = Array.isArray(detalhes.ambiguidades) ? [...detalhes.ambiguidades] : [];
  const pendentesExtrato = Array.isArray(detalhes.pendentesExtrato) ? [...detalhes.pendentesExtrato] : [];
  const pendentesLedger = Array.isArray(detalhes.pendentesLedger) ? [...detalhes.pendentesLedger] : [];
  const conciliados = Array.isArray(detalhes.conciliados) ? [...detalhes.conciliados] : [];

  const idxAmb = ambiguidades.findIndex(a => String(a.extratoId) === String(extratoId));
  const idxPend = pendentesExtrato.findIndex(p => String(p.extratoId || p.id) === String(extratoId));

  if (idxAmb < 0 && idxPend < 0) {
    throw new HttpsError('failed-precondition', `Item de extrato ${extratoId} não está pendente nem ambíguo.`);
  }

  const itemAlvo = idxAmb >= 0 ? ambiguidades[idxAmb] : pendentesExtrato[idxPend];
  const valorItemCents = Number(itemAlvo.valorCents || 0);
  const valorLancCents = Number(lanc.valorCents || 0);

  if (valorItemCents !== valorLancCents) {
    throw new HttpsError(
      'failed-precondition',
      `Não é permitido vincular itens com valores divergentes (extrato: ${valorItemCents} cents vs ledger: ${valorLancCents} cents).`
    );
  }

  if (idxAmb >= 0) ambiguidades.splice(idxAmb, 1);
  if (idxPend >= 0) pendentesExtrato.splice(idxPend, 1);
  const novosPendentesLedger = pendentesLedger.filter(l => String(l.id) !== String(lancamentoId));

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);

  conciliados.push({
    pareamento: 'manual_operador',
    extratoId,
    lancamentoId,
    valorCents: valorItemCents,
    valor: valorItemCents / 100,
    vinculadoPor: usuario,
    vinculadoEm: agora,
    justificativa: String(justificativa || 'Vínculo manual pelo operador')
  });

  const divergentesValor = Array.isArray(detalhes.divergentesValor) ? detalhes.divergentesValor : [];
  const conciliadoComSucesso =
    divergentesValor.length === 0 &&
    ambiguidades.length === 0 &&
    pendentesExtrato.length === 0 &&
    novosPendentesLedger.length === 0;

  const atualizado = {
    ...conc,
    status: conciliadoComSucesso ? 'Conciliada' : 'ComPendencias',
    resumo: {
      ...(conc.resumo || {}),
      conciliados: conciliados.length,
      ambiguidades: ambiguidades.length,
      pendentesExtrato: pendentesExtrato.length,
      pendentesLedger: novosPendentesLedger.length
    },
    detalhes: {
      ...detalhes,
      conciliados,
      ambiguidades,
      pendentesExtrato,
      pendentesLedger: novosPendentesLedger,
      conciliadoComSucesso
    }
  };

  await customDb.ref(`/conciliacoes/${conciliacaoId}`).set(atualizado);
  await registrarAuditoria(
    {
      usuario,
      modulo: 'financeiro/conciliacao',
      eventoId: conc.competencia || '',
      acao: 'Vínculo Manual de Conciliação',
      resumo: `Item OFX ${extratoId} vinculado manualmente ao lançamento ${lancamentoId} por ${usuario}.`
    },
    customDb
  );

  return atualizado;
}

exports.importarExtratoOFX = onCall(req => executarImportarExtratoOFX(req));
exports.vincularItemConciliacao = onCall(req => executarVincularItemConciliacao(req));
exports.executarImportarExtratoOFX = executarImportarExtratoOFX;
exports.executarVincularItemConciliacao = executarVincularItemConciliacao;
