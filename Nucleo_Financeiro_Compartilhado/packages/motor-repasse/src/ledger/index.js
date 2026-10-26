/**
 * Motor do Ledger Imutável (/lancamentos) com Partida Dobrada, Plano de Contas e Bloqueio por /fechamentos
 */

'use strict';

const { toCents, fromCents } = require('../shared/money');

/**
 * Plano de Contas Oficial do Núcleo Financeiro DiskIngressos
 */
const PLANO_CONTAS = Object.freeze({
  BANCO_CONTA_MOVIMENTO: '1.1.01.001 - Conta Movimento Bancária Disk',
  CLIENTES_ADQUIRENTES_RECEBER: '1.1.02.001 - Clientes e Adquirentes a Receber',
  OBRIGACOES_REPASSES_PRODUTOR: '2.1.01.001 - Obrigações de Repasse Produtor',
  OBRIGACOES_RETENCOES_RECOLHER: '2.1.01.002 - Retenções de Eventos a Recolher',
  RECEITA_TAXAS_DISK: '3.1.01.001 - Receita de Taxas (Adm/Op) Disk',
  RECEITA_TARIFA_TRANSFERENCIA: '4.1.02.01 - Receita de Tarifa de Transferência (TED)'
});

/**
 * Formata uma instância Date para DD/MM/YYYY no fuso America/Sao_Paulo (evita virada de dia/mês em UTC).
 */
function obterDataAtualBR(date = new Date()) {
  const dt = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(dt);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return `${map.day}/${map.month}/${map.year}`;
}

function extrairCompetencia(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return '';
  const limpo = dataStr.trim();
  const mBR = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(limpo);
  if (mBR) return `${mBR[3]}-${mBR[2]}`;
  const mISO = /^(\d{4})-(\d{2})/.exec(limpo);
  if (mISO) return `${mISO[1]}-${mISO[2]}`;
  return '';
}

/**
 * Retorna a competência contábil (YYYY-MM) no fuso America/Sao_Paulo.
 */
function obterCompetenciaAtualBR(date = new Date()) {
  return extrairCompetencia(obterDataAtualBR(date));
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
  const dataEfetiva = params.data || params.dataLancamento || obterDataAtualBR();
  const competencia = params.competencia || extrairCompetencia(dataEfetiva);

  if (!Number.isFinite(valorCents) || valorCents <= 0) {
    throw new Error('O lançamento de partida dobrada exige valor maior que zero.');
  }
  if (!params.contaDebito || !params.contaCredito) {
    throw new Error('Informe obrigatoriamente contaDebito e contaCredito.');
  }
  if (String(params.contaDebito).trim() === String(params.contaCredito).trim()) {
    throw new Error('contaDebito e contaCredito devem ser distintas na partida dobrada.');
  }
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    throw new Error('Competência (YYYY-MM) ou data válida (DD/MM/YYYY) é obrigatória.');
  }
  if (competenciaEstaFechada(competencia, fechamentosMap)) {
    throw new Error(`A competência ${competencia} já está encerrada em /fechamentos e bloqueia lançamentos retroativos.`);
  }

  return {
    id: params.id || null,
    data: dataEfetiva,
    dataLancamento: dataEfetiva,
    competencia,
    contaDebito: String(params.contaDebito).trim(),
    contaCredito: String(params.contaCredito).trim(),
    valorCents,
    valor: fromCents(valorCents),
    produtoraId: params.produtoraId || null,
    eventoId: params.eventoId || null,
    origemModulo: String(params.origemModulo || 'manual'),
    origemId: String(params.origemId || ''),
    historico: String(params.historico || ''),
    tipo: params.estornoDeId ? 'estorno' : 'original',
    estornoDeId: params.estornoDeId || null,
    criadoPor: String(params.criadoPor || params.usuario || 'financeiro'),
    usuario: String(params.usuario || params.criadoPor || 'financeiro'),
    criadoEm: params.criadoEm || dataEfetiva,
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

  const dataEstorno = dadosEstorno.data || lancamentoOriginal.data || obterDataAtualBR();
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
      criadoPor: dadosEstorno.usuario || 'financeiro',
      criadoEm: dadosEstorno.criadoEm || dataEstorno
    },
    fechamentosMap
  );
}

module.exports = {
  PLANO_CONTAS,
  obterDataAtualBR,
  obterCompetenciaAtualBR,
  extrairCompetencia,
  competenciaEstaFechada,
  criarLancamentoPartidaDobrada,
  gerarEstornoLancamento
};
