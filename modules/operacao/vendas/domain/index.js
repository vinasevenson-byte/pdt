/**
 * Domínio Puro (em centavos) — Módulo Operação de Vendas, Lotes e Cortesias (operacao/vendas)
 * - Ingestão idempotente de lotes de vendas e cortesias com hash SHA-256
 * - Validação de capacidade do evento e capacidade específica do setor aberto
 * - Cálculo exato em centavos da receita bruta do lote e atualização acumulada de bilheteria
 * - Geração de título de Contas a Receber (/contas_receber/cr_vnd_{loteId}) por adquirente/PIX
 */
'use strict';

const crypto = require('node:crypto');
const {
  calcularCapacidadeEContadosEvento,
  validarIdCadastro,
  gerarIdCadastro
} = require('../../../../packages/motor-repasse/src/index.js');

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function round2(v) {
  return fromCents(toCents(v));
}

function calcularVendas(registro = {}) {
  const qtdVendida = Math.max(0, Math.round(Number(registro.quantidadeVendida ?? registro.vendidos ?? 0)));
  const qtdCortesias = Math.max(0, Math.round(Number(registro.quantidadeCortesias ?? registro.cortesias ?? 0)));
  const precoUnitCents = toCents(registro.precoUnitario || 0);
  const valorBrutoInformadoCents = toCents(registro.valorBruto || 0);
  const valorBrutoCents =
    valorBrutoInformadoCents > 0 ? valorBrutoInformadoCents : qtdVendida * precoUnitCents;

  return {
    id: registro.id || registro.loteId || null,
    eventoId: registro.eventoId || null,
    produtoraId: registro.produtoraId || null,
    setor: registro.setor || 'Geral',
    nomeLote: registro.nomeLote || '1º Lote',
    quantidadeVendida: qtdVendida,
    quantidadeCortesias: qtdCortesias,
    precoUnitarioCents: precoUnitCents,
    precoUnitario: fromCents(precoUnitCents),
    valorBrutoCents,
    valorBruto: fromCents(valorBrutoCents),
    meioPagamento: registro.meioPagamento || 'PIX',
    status: registro.status || 'Processado'
  };
}

function calcularHashLoteVendas({ eventoId, setor, nomeLote, quantidadeVendida, quantidadeCortesias, valorBrutoCents, meioPagamento }) {
  const payload = JSON.stringify({
    eventoId,
    setor,
    nomeLote,
    quantidadeVendida,
    quantidadeCortesias,
    valorBrutoCents,
    meioPagamento
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function validarIngestaoVendasLote(dados = {}, contexto = {}) {
  const {
    eventoExistente = null,
    produtoraExistente = null,
    localExistente = null,
    lotesExistentes = {}
  } = contexto;

  const eventoId = String(dados.eventoId || '').trim();
  if (!eventoId) {
    throw new Error('O identificador do evento (eventoId) é obrigatório.');
  }
  if (!eventoExistente) {
    throw new Error(`Evento "${eventoId}" não encontrado no cadastro mestre.`);
  }
  if (eventoExistente.ativo === false) {
    throw new Error(`Não é permitido registrar vendas para o evento inativo "${eventoId}".`);
  }
  if (produtoraExistente && produtoraExistente.ativo === false) {
    throw new Error(`Não é permitido registrar vendas para produtora inativa ("${eventoExistente.produtoraId}").`);
  }
  if (localExistente && localExistente.ativo === false) {
    throw new Error(`Não é permitido registrar vendas para local inativo ("${eventoExistente.localId}").`);
  }

  const loteIdInformado = dados.loteId ? String(dados.loteId).trim() : '';
  if (loteIdInformado && !validarIdCadastro(loteIdInformado)) {
    throw new Error(`Identificador de lote inválido ("${loteIdInformado}"). Use apenas [a-z0-9_].`);
  }
  const loteId = loteIdInformado || gerarIdCadastro('lote', `${eventoId}_${dados.nomeLote || 'venda'}`);

  const quantidadeVendida = Math.round(Number(dados.quantidadeVendida ?? dados.vendidos ?? 0));
  const quantidadeCortesias = Math.round(Number(dados.quantidadeCortesias ?? dados.cortesias ?? 0));
  if (!Number.isFinite(quantidadeVendida) || quantidadeVendida < 0) {
    throw new Error('quantidadeVendida deve ser um inteiro >= 0.');
  }
  if (!Number.isFinite(quantidadeCortesias) || quantidadeCortesias < 0) {
    throw new Error('quantidadeCortesias deve ser um inteiro >= 0.');
  }
  if (quantidadeVendida === 0 && quantidadeCortesias === 0) {
    throw new Error('O lote deve conter ao menos 1 ingresso vendido ou 1 cortesia.');
  }

  const precoUnitarioCents = toCents(dados.precoUnitario || 0);
  const valorBrutoInformadoCents = toCents(dados.valorBruto || 0);
  const valorBrutoCents =
    valorBrutoInformadoCents > 0 ? valorBrutoInformadoCents : quantidadeVendida * precoUnitarioCents;

  if (quantidadeVendida > 0 && valorBrutoCents <= 0) {
    throw new Error('Quando há ingressos vendidos (quantidadeVendida > 0), informe valorBruto > 0 ou precoUnitario > 0.');
  }

  const setor = String(dados.setor || '').trim() || 'Geral';
  const nomeLote = String(dados.nomeLote || '1º Lote').trim();
  const meioPagamento = ['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO'].includes(dados.meioPagamento)
    ? dados.meioPagamento
    : 'PIX';

  const hashLoteSha256 = calcularHashLoteVendas({
    eventoId,
    setor,
    nomeLote,
    quantidadeVendida,
    quantidadeCortesias,
    valorBrutoCents,
    meioPagamento
  });

  // Checagem de idempotência
  const loteJaGravado = lotesExistentes && lotesExistentes[loteId];
  if (loteJaGravado) {
    if (loteJaGravado.hashLoteSha256 === hashLoteSha256) {
      return {
        idempotente: true,
        loteId,
        eventoId,
        produtoraId: eventoExistente.produtoraId,
        hashLoteSha256,
        registroLote: loteJaGravado
      };
    }
    throw new Error(
      `Conflito de idempotência: o lote "${loteId}" já foi registrado com parâmetros diferentes.`
    );
  }

  // Validação de setor quando o evento opera por setores
  const capConfig = eventoExistente.capacidade || { modo: 'local' };
  const setoresLocal = Array.isArray(localExistente && localExistente.setores) ? localExistente.setores : [];
  if (capConfig.modo === 'setores') {
    const abertos = Array.isArray(capConfig.setoresAbertos) ? capConfig.setoresAbertos : [];
    if (dados.setor && !abertos.includes(setor)) {
      throw new Error(
        `O setor "${setor}" não está aberto no evento "${eventoId}". Setores abertos: ${abertos.join(', ')}.`
      );
    }
    const setorDef = setoresLocal.find(s => s && s.nome === setor);
    if (setorDef) {
      // Soma os ingressos já lançados em lotes anteriores para este mesmo setor
      const contadosSetorAnterior = Object.values(lotesExistentes || {})
        .filter(l => l && l.eventoId === eventoId && l.setor === setor && l.status === 'Processado')
        .reduce(
          (acc, l) =>
            acc +
            Number(l.quantidadeVendida || 0) +
            (capConfig.contarCortesias ? Number(l.quantidadeCortesias || 0) : 0),
          0
        );
      const novosDoSetor =
        contadosSetorAnterior + quantidadeVendida + (capConfig.contarCortesias ? quantidadeCortesias : 0);
      if (novosDoSetor > Number(setorDef.capacidade || 0)) {
        throw new Error(
          `A ingestão ultrapassa a capacidade do setor "${setor}" (${novosDoSetor} > ${setorDef.capacidade}).`
        );
      }
    }
  }

  // Validação da capacidade global do evento
  const vendidosAtuais = Number((eventoExistente.vendas && eventoExistente.vendas.vendidos) || 0);
  const cortesiasAtuais = Number((eventoExistente.vendas && eventoExistente.vendas.cortesias) || 0);
  const bilheteriaAtualCents = toCents(eventoExistente.bilheteria || 0);

  const novosVendidos = vendidosAtuais + quantidadeVendida;
  const novasCortesias = cortesiasAtuais + quantidadeCortesias;
  const novaBilheteriaCents = bilheteriaAtualCents + valorBrutoCents;

  const eventoSimulado = {
    ...eventoExistente,
    vendas: {
      vendidos: novosVendidos,
      cortesias: novasCortesias
    },
    bilheteria: fromCents(novaBilheteriaCents)
  };

  const checkCap = calcularCapacidadeEContadosEvento(eventoSimulado, localExistente || {});
  if (checkCap.ingressosContados > checkCap.capacidadeUsada) {
    throw new Error(
      `Ultrapassa o teto de capacidade do evento "${eventoId}": ingressos contados (${checkCap.ingressosContados}) > capacidade configurada (${checkCap.capacidadeUsada}).`
    );
  }

  const produtoraId = String(eventoExistente.produtoraId || '');
  const registroLote = {
    id: loteId,
    loteId,
    eventoId,
    produtoraId,
    setor,
    nomeLote,
    quantidadeVendida,
    quantidadeCortesias,
    precoUnitarioCents: precoUnitarioCents || (quantidadeVendida > 0 ? Math.round(valorBrutoCents / quantidadeVendida) : 0),
    precoUnitario: fromCents(
      precoUnitarioCents || (quantidadeVendida > 0 ? Math.round(valorBrutoCents / quantidadeVendida) : 0)
    ),
    valorBrutoCents,
    valorBruto: fromCents(valorBrutoCents),
    meioPagamento,
    hashLoteSha256,
    status: 'Processado'
  };

  const tituloReceber =
    valorBrutoCents > 0
      ? {
          id: `cr_vnd_${loteId}`,
          produtoraId,
          eventoId,
          origemLoteId: loteId,
          categoria: 'venda_ingressos',
          meioPagamento,
          descricao: `Venda de ingressos (${nomeLote} - ${setor}) — ${quantidadeVendida} un.`,
          valorCents: valorBrutoCents,
          valor: fromCents(valorBrutoCents),
          status: meioPagamento === 'PIX' ? 'Recebido' : 'Previsto'
        }
      : null;

  return {
    idempotente: false,
    loteId,
    eventoId,
    produtoraId,
    hashLoteSha256,
    quantidadeVendida,
    quantidadeCortesias,
    valorBrutoCents,
    valorBruto: fromCents(valorBrutoCents),
    novosVendidos,
    novasCortesias,
    novaBilheteria: fromCents(novaBilheteriaCents),
    registroLote,
    tituloReceber
  };
}

module.exports = {
  calcularVendas,
  calcularHashLoteVendas,
  validarIngestaoVendasLote
};
