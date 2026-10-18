/**
 * Motor do Ledger Imutável (/lancamentos) com Partida Dobrada e Bloqueio por /fechamentos
 */

'use strict';

const { toCents, fromCents } = require('../shared/money');

function extrairCompetencia(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return '';
  const limpo = dataStr.trim();
  const mBR = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(limpo);
  if (mBR) return `${mBR[3]}-${mBR[2]}`;
  const mISO = /^(\d{4})-(\d{2})/.exec(limpo);
  if (mISO) return `${mISO[1]}-${mISO[2]}`;
  return '';
}

function competenciaEstaFechada(competencia, fechamentosMap = {}) {
  if (!competencia || !fechamentosMap) return false;
  const fech = fechamentosMap[competencia];
  return Boolean(fech && (fech.fechado === true || fech.status === 'Fechado'));
}

/**
 * Cria um lançamento contábil imutável com partida dobrada.
 */
function criarLancamentoPartidaDobrada(params = {}, fechamentosMap = {}) {
  const valorCents = params.valorCents !== undefined ? Math.round(Number(params.valorCents)) : toCents(params.valor);
  const competencia = params.competencia || extrairCompetencia(params.data);

  if (valorCents <= 0) {
    throw new Error('O lançamento de partida dobrada exige valor maior que zero.');
  }
  if (!params.contaDebito || !params.contaCredito) {
    throw new Error('Informe obrigatoriamente contaDebito e contaCredito.');
  }
  if (params.contaDebito === params.contaCredito) {
    throw new Error('contaDebito e contaCredito devem ser distintas na partida dobrada.');
  }
  if (!competencia) {
    throw new Error('Competência (YYYY-MM) ou data válida (DD/MM/YYYY) é obrigatória.');
  }
  if (competenciaEstaFechada(competencia, fechamentosMap)) {
    throw new Error(`A competência ${competencia} já está encerrada em /fechamentos e bloqueia lançamentos retroativos.`);
  }

  return {
    id: params.id || null,
    data: params.data,
    competencia,
    contaDebito: String(params.contaDebito),
    contaCredito: String(params.contaCredito),
    valorCents,
    valor: fromCents(valorCents),
    produtoraId: params.produtoraId || null,
    eventoId: params.eventoId || null,
    origemModulo: String(params.origemModulo || 'manual'),
    origemId: String(params.origemId || ''),
    historico: String(params.historico || ''),
    tipo: params.estornoDeId ? 'estorno' : 'original',
    estornoDeId: params.estornoDeId || null,
    criadoPor: String(params.criadoPor || 'financeiro'),
    imutavel: true
  };
}

/**
 * Gera um lançamento de estorno invertendo contaDebito e contaCredito (nunca edita o lançamento original).
 */
function gerarEstornoLancamento(lancamentoOriginal = {}, dadosEstorno = {}, fechamentosMap = {}) {
  if (!lancamentoOriginal || !lancamentoOriginal.id) {
    throw new Error('Lançamento original com id é obrigatório para estorno.');
  }
  if (!dadosEstorno.motivo || String(dadosEstorno.motivo).trim().length < 3) {
    throw new Error('Motivo do estorno é obrigatório.');
  }

  const dataEstorno = dadosEstorno.data || lancamentoOriginal.data;
  const competenciaEstorno = dadosEstorno.competencia || extrairCompetencia(dataEstorno);

  return criarLancamentoPartidaDobrada(
    {
      id: dadosEstorno.id || null,
      data: dataEstorno,
      competencia: competenciaEstorno,
      contaDebito: lancamentoOriginal.contaCredito,
      contaCredito: lancamentoOriginal.contaDebito,
      valorCents: lancamentoOriginal.valorCents || toCents(lancamentoOriginal.valor),
      produtoraId: lancamentoOriginal.produtoraId,
      eventoId: lancamentoOriginal.eventoId,
      origemModulo: lancamentoOriginal.origemModulo,
      origemId: lancamentoOriginal.origemId,
      historico: `ESTORNO (#${lancamentoOriginal.id}): ${String(dadosEstorno.motivo).trim()}`,
      estornoDeId: lancamentoOriginal.id,
      criadoPor: dadosEstorno.usuario || 'financeiro'
    },
    fechamentosMap
  );
}

module.exports = {
  extrairCompetencia,
  competenciaEstaFechada,
  criarLancamentoPartidaDobrada,
  gerarEstornoLancamento
};
