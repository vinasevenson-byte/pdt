/**
 * Motor de Contas a Pagar (/contas_pagar) e Contas a Receber (/contas_receber)
 * Status: Prevista | Aprovada | Paga | Recebida | Cancelada | Vencida (derivado da data)
 */

'use strict';

const { toCents, fromCents } = require('../shared/money');
const { PLANO_CONTAS, criarLancamentoPartidaDobrada } = require('../ledger');

function parseDataUTC(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return null;
  const limpo = dataStr.trim();
  const mBR = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(limpo);
  if (mBR) {
    return new Date(Date.UTC(Number(mBR[3]), Number(mBR[2]) - 1, Number(mBR[1]), 12, 0, 0));
  }
  const mISO = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpo);
  if (mISO) {
    return new Date(Date.UTC(Number(mISO[1]), Number(mISO[2]) - 1, Number(mISO[3]), 12, 0, 0));
  }
  return null;
}

/**
 * Deriva o status efetivo do título considerando a data de vencimento e a data de referência.
 */
function derivarStatusTitulo(titulo = {}, dataReferenciaStr = null) {
  const statusBase = titulo.status || 'Prevista';
  if (['Paga', 'Recebida', 'Cancelada'].includes(statusBase)) {
    return statusBase;
  }
  if ( dataReferenciaStr && titulo.vencimento ) {
    const dtVenc = parseDataUTC(titulo.vencimento);
    const dtRef = parseDataUTC(dataReferenciaStr);
    if (dtVenc && dtRef && dtRef.getTime() > dtVenc.getTime()) {
      return 'Vencida';
    }
  }
  return statusBase;
}

/**
 * Gera os títulos de Contas a Receber e Contas a Pagar a partir de um evento calculado pelo motor.
 */
function gerarTitulosEvento(evento = {}, calc = {}, dataVencimentoPadrao = null) {
  const vencimento = dataVencimentoPadrao || calc.dataLiberacaoTotal || evento.data || '01/01/2026';
  const contasReceber = [];
  const contasPagar = [];

  // 1. Contas a Receber: Bilheteria (Adquirente/Gateway) + Taxas do Disk (Taxa Adm Líquida + Taxa Op)
  if (toCents(calc.bil) > 0) {
    contasReceber.push({
      id: `cr_bil_${evento.id}`,
      natureza: 'receber',
      categoria: 'Bilheteria Adquirente',
      eventoId: evento.id,
      produtoraId: evento.produtoraId,
      vencimento,
      valorCents: toCents(calc.bil),
      valor: fromCents(toCents(calc.bil)),
      status: 'Prevista',
      origemModulo: 'eventos',
      origemId: evento.id
    });
  }

  const taxasDiskCents = toCents(calc.receitaDiskLiquida !== undefined ? calc.receitaDiskLiquida : (calc.taxaAdm + calc.taxaOp));
  if (taxasDiskCents > 0) {
    contasReceber.push({
      id: `cr_taxas_${evento.id}`,
      natureza: 'receber',
      categoria: 'Receita Taxas Disk',
      eventoId: evento.id,
      produtoraId: evento.produtoraId,
      vencimento,
      valorCents: taxasDiskCents,
      valor: fromCents(taxasDiskCents),
      status: 'Prevista',
      origemModulo: 'negociacoes',
      origemId: evento.id
    });
  }

  // 2. Contas a Pagar: Repasse liberável ao produtor + Retenções a recolher pelo Disk
  if (toCents(calc.liberavel) > 0) {
    contasPagar.push({
      id: `cp_rep_${evento.id}`,
      natureza: 'pagar',
      categoria: 'Repasse Produtor',
      eventoId: evento.id,
      produtoraId: evento.produtoraId,
      vencimento,
      valorCents: toCents(calc.liberavel),
      valor: fromCents(toCents(calc.liberavel)),
      status: 'Prevista',
      origemModulo: 'repasses',
      origemId: evento.id
    });
  }

  const retencoes = Array.isArray(calc.retencoesDetalhe) ? calc.retencoesDetalhe : [];
  for (const ret of retencoes) {
    if (ret.descontaDoRepasse && toCents(ret.valor) > 0) {
      contasPagar.push({
        id: `cp_ret_${evento.id}_${ret.id || ret.nome}`,
        natureza: 'pagar',
        categoria: `Retenção a Recolher (${ret.nome})`,
        eventoId: evento.id,
        produtoraId: evento.produtoraId,
        vencimento,
        valorCents: toCents(ret.valor),
        valor: fromCents(toCents(ret.valor)),
        status: 'Prevista',
        origemModulo: 'eventos',
        origemId: `${evento.id}:${ret.id || ret.nome}`
      });
    }
  }

  return {
    contasReceber,
    contasPagar
  };
}

/**
 * Baixa um título (Pagar -> Paga | Receber -> Recebida) e gera o lançamento correspondente no Ledger.
 */
function baixarTitulo(titulo = {}, dadosBaixa = {}, fechamentosMap = {}) {
  if (!titulo || !titulo.natureza) {
    throw new Error('Título inválido para baixa.');
  }
  if (['Paga', 'Recebida', 'Cancelada'].includes(titulo.status)) {
    throw new Error(`Título já se encontra com status ${titulo.status}.`);
  }

  const isPagar = titulo.natureza === 'pagar';
  const novoStatus = isPagar ? 'Paga' : 'Recebida';
  const dataBaixa = dadosBaixa.dataBaixa || titulo.vencimento;
  const valorCents = dadosBaixa.valorPagoCents !== undefined
    ? Math.round(Number(dadosBaixa.valorPagoCents))
    : (titulo.valorCents !== undefined ? titulo.valorCents : toCents(titulo.valor));

  const contaBanco = dadosBaixa.contaBanco || PLANO_CONTAS.BANCO_CONTA_MOVIMENTO;
  const contaContrapartida = isPagar
    ? (dadosBaixa.contaObrigacao || (titulo.categoria === 'Repasse Produtor' ? PLANO_CONTAS.OBRIGACOES_REPASSES_PRODUTOR : PLANO_CONTAS.OBRIGACOES_RETENCOES_RECOLHER))
    : (dadosBaixa.contaDireito || (titulo.categoria === 'Receita Taxas Disk' ? PLANO_CONTAS.RECEITA_TAXAS_DISK : PLANO_CONTAS.CLIENTES_ADQUIRENTES_RECEBER));

  const lancamento = criarLancamentoPartidaDobrada(
    {
      id: dadosBaixa.lancamentoId || null,
      data: dataBaixa,
      contaDebito: isPagar ? contaContrapartida : contaBanco,
      contaCredito: isPagar ? contaBanco : contaContrapartida,
      valorCents,
      produtoraId: titulo.produtoraId || null,
      eventoId: titulo.eventoId || null,
      origemModulo: isPagar ? 'contas_pagar' : 'contas_receber',
      origemId: titulo.id || '',
      historico: dadosBaixa.historico || `Baixa de título (${titulo.categoria || titulo.natureza}) #${titulo.id || ''}`,
      criadoPor: dadosBaixa.usuario || 'financeiro'
    },
    fechamentosMap
  );

  const tituloAtualizado = {
    ...titulo,
    status: novoStatus,
    baixadoEm: dataBaixa,
    baixadoPor: dadosBaixa.usuario || 'financeiro',
    valorBaixadoCents: valorCents,
    valorBaixado: fromCents(valorCents)
  };

  return {
    tituloAtualizado,
    lancamento
  };
}

module.exports = {
  derivarStatusTitulo,
  gerarTitulosEvento,
  baixarTitulo
};
