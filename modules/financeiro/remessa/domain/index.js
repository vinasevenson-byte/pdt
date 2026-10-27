/**
 * Domínio Puro (em centavos) — Módulo Remessa PIX / CNAB 240 Pagamentos (financeiro/remessa)
 * - Geração de lote CNAB 240 (240 colunas por linha) a partir de títulos Aprovados (/contas_pagar)
 * - Parser e processamento de retorno bancário (liquidação código "00" vs rejeição bancária "RJ"/"DV")
 */
'use strict';

const crypto = require('node:crypto');

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function padRight(str, len, ch = ' ') {
  const s = String(str || '').slice(0, len);
  return s + ch.repeat(Math.max(0, len - s.length));
}

function padLeft(str, len, ch = '0') {
  const s = String(str || '').slice(0, len);
  return ch.repeat(Math.max(0, len - s.length)) + s;
}

function calcularRemessa(registro = {}) {
  const valorBaseCents = toCents(registro.valorBase || registro.valor || 0);
  const abatimentoCents = toCents(registro.abatimento || 0);
  const liquidoCents = Math.max(0, valorBaseCents - abatimentoCents);

  return {
    id: registro.id || null,
    produtoraId: registro.produtoraId || null,
    eventoId: registro.eventoId || null,
    valorBaseCents,
    valorBase: fromCents(valorBaseCents),
    abatimentoCents,
    abatimento: fromCents(abatimentoCents),
    valorLiquidoCents: liquidoCents,
    valorLiquido: fromCents(liquidoCents),
    status: registro.status || 'Pendente'
  };
}

/**
 * Gera um lote de pagamento e o arquivo CNAB 240 (240 posições por linha) a partir de títulos em /contas_pagar.
 * Regra:
 * - Apenas títulos com status === 'Aprovada' e sem remessa ativa (`!t.remessaId`) entram no lote.
 * - Exige conta bancária validada (`status === 'Validada'`).
 */
function gerarLoteRemessaPagamento({
  numeroSequencial = 1,
  codigoBanco = '341',
  empresa = { nome: 'DISKINGRESSOS LTDA', cnpj: '12345678000199', agencia: '1234', conta: '567890' },
  titulos = [],
  repasses = {},
  contasPorProdutora = {},
  dataGeracao = '26/10/2026'
} = {}) {
  const listaTitulos = Array.isArray(titulos)
    ? titulos
    : Object.entries(titulos || {}).map(([id, t]) => ({ ...t, id: t.id || id }));

  const itensElegiveis = [];
  const rejeitadosNaTriagem = [];

  for (const t of listaTitulos) {
    if (!t || typeof t !== 'object') continue;
    const tituloId = String(t.id || '');
    if (t.status !== 'Aprovada') {
      rejeitadosNaTriagem.push({
        tituloId,
        motivo: `Status "${t.status}" inválido para remessa (exigido: "Aprovada").`
      });
      continue;
    }
    if (t.remessaId) {
      rejeitadosNaTriagem.push({
        tituloId,
        motivo: `Título já incluído na remessa ativa ${t.remessaId}.`
      });
      continue;
    }

    const rep = t.repasseId && repasses ? repasses[t.repasseId] : null;
    const contaId = t.contaId || (rep && rep.contaId) || 'c1';
    const forma = t.forma || (rep && rep.forma) || 'PIX';
    const contasProd = (contasPorProdutora && contasPorProdutora[t.produtoraId]) || {};
    const conta = contasProd[contaId];

    if (!conta || conta.status !== 'Validada') {
      rejeitadosNaTriagem.push({
        tituloId,
        motivo: `Conta bancária ${contaId} da produtora ${t.produtoraId} não encontrada ou não Validada.`
      });
      continue;
    }

    const valorCents =
      t.valorCents !== undefined
        ? Math.round(Number(t.valorCents))
        : toCents(t.valorOriginal !== undefined ? t.valorOriginal : t.valor || 0);

    if (valorCents <= 0) {
      rejeitadosNaTriagem.push({
        tituloId,
        motivo: 'Valor do título deve ser maior que zero.'
      });
      continue;
    }

    itensElegiveis.push({
      tituloId,
      produtoraId: t.produtoraId,
      eventoId: t.eventoId || null,
      repasseId: t.repasseId || null,
      antecipacaoId: t.antecipacaoId || null,
      contaId,
      forma,
      bancoFavorecido: String(conta.banco || '341').replace(/\D/g, '').slice(0, 3) || '341',
      agenciaFavorecido: String(conta.agencia || '0001').replace(/\D/g, '').slice(0, 5) || '0001',
      contaFavorecido: String(conta.conta || '00000').replace(/\D/g, '').slice(0, 12) || '00000',
      titularFavorecido: String(conta.titular || t.fornecedor || t.produtoraId),
      valorCents,
      valor: fromCents(valorCents),
      statusItem: 'Enviado'
    });
  }

  const dataLimpa = String(dataGeracao || '26/10/2026').replace(/\D/g, '').padEnd(8, '0').slice(0, 8);
  const banco3 = padLeft(String(codigoBanco).replace(/\D/g, ''), 3, '0');
  const cnpj14 = padLeft(String(empresa.cnpj || '').replace(/\D/g, ''), 14, '0');
  const seq6 = padLeft(numeroSequencial, 6, '0');

  const linhas = [];

  // Registro 0 — Header de Arquivo (240 posições)
  const headerArquivo =
    banco3 +
    '0000' +
    '0' +
    padRight('', 9) +
    '2' +
    cnpj14 +
    padRight('', 20) +
    padLeft(empresa.agencia || '0001', 5, '0') +
    ' ' +
    padLeft(empresa.conta || '00000', 12, '0') +
    ' ' +
    '0' +
    padRight(empresa.nome || 'DISKINGRESSOS LTDA', 30) +
    padRight('BANCO REMESSA CNAB240', 30) +
    padRight('', 10) +
    '1' +
    dataLimpa +
    '120000' +
    seq6 +
    '089' +
    '00000' +
    padRight('', 69);
  linhas.push(padRight(headerArquivo, 240));

  // Registro 1 — Header de Lote (240 posições)
  const headerLote =
    banco3 +
    '0001' +
    '1' +
    'C' +
    '20' +
    '45' +
    '040' +
    ' ' +
    '2' +
    cnpj14 +
    padRight('', 20) +
    padLeft(empresa.agencia || '0001', 5, '0') +
    ' ' +
    padLeft(empresa.conta || '00000', 12, '0') +
    ' ' +
    '0' +
    padRight(empresa.nome || 'DISKINGRESSOS LTDA', 30) +
    padRight('', 40) +
    padRight('', 80);
  linhas.push(padRight(headerLote, 240));

  let somaValorCents = 0;
  itensElegiveis.forEach((item, idx) => {
    somaValorCents += item.valorCents;
    // Registro 3 — Segmento A (posições fixas incluindo seuNumero [74..93] e valorCents [120..134])
    const segA =
      banco3 +
      '0001' +
      '3' +
      padLeft(idx + 1, 5, '0') +
      'A' +
      '000' +
      padLeft(item.bancoFavorecido, 3, '0') +
      padLeft(item.agenciaFavorecido, 5, '0') +
      ' ' +
      padLeft(item.contaFavorecido, 12, '0') +
      ' ' +
      '0' +
      padRight(item.titularFavorecido, 30) +
      padRight(item.tituloId, 20) + // posições 74..93 (índice 73..93) = seuNumero (tituloId)
      dataLimpa +
      'BRL' +
      padLeft('0', 15, '0') +
      padLeft(item.valorCents, 15, '0') + // posições 120..134 (índice 119..134) = valorCents
      padRight(`PROTO_${item.tituloId}`, 20) + // posições 135..154 = nossoNumero
      dataLimpa +
      padLeft(item.valorCents, 15, '0') +
      padRight('', 52) +
      '00'; // posições 231..232 (índice 230..232) = código ocorrência
    linhas.push(padRight(segA, 240));
  });

  // Registro 5 — Trailer de Lote (240 posições)
  const qtdRegistrosLote = itensElegiveis.length + 2;
  const trailerLote =
    banco3 +
    '0001' +
    '5' +
    padRight('', 9) +
    padLeft(qtdRegistrosLote, 6, '0') +
    padLeft(somaValorCents, 18, '0') +
    padRight('', 199);
  linhas.push(padRight(trailerLote, 240));

  // Registro 9 — Trailer de Arquivo (240 posições)
  const qtdRegistrosArquivo = linhas.length + 1;
  const trailerArquivo =
    banco3 +
    '9999' +
    '9' +
    padRight('', 9) +
    '000001' +
    padLeft(qtdRegistrosArquivo, 6, '0') +
    padRight('', 211);
  linhas.push(padRight(trailerArquivo, 240));

  const cnab240 = linhas.join('\n');
  const hashRemessa = crypto.createHash('sha256').update(cnab240, 'utf8').digest('hex');

  return {
    numeroSequencial,
    codigoBanco: banco3,
    dataGeracao,
    quantidadeItens: itensElegiveis.length,
    valorTotalCents: somaValorCents,
    valorTotal: fromCents(somaValorCents),
    itens: itensElegiveis,
    rejeitadosNaTriagem,
    cnab240,
    hashRemessa
  };
}

/**
 * Faz o parse de um arquivo de retorno CNAB 240 (Segmento A) ou lista estruturada de retornos.
 * Códigos de ocorrência:
 * - "00" ou "BD": Liquidação confirmada
 * - Qualquer outro ("RJ", "DV", "AJ", etc.): Rejeitado pelo banco
 */
function parsearRetornoCNAB240(entrada = '') {
  if (Array.isArray(entrada)) {
    return entrada.map(item => {
      const codigo = String(item.codigoOcorrencia || '00').trim().toUpperCase();
      const liquidado = codigo === '00' || codigo === 'BD';
      const valorCents =
        item.valorCents !== undefined ? Math.round(Number(item.valorCents)) : toCents(item.valor || 0);
      return {
        tituloId: String(item.tituloId || '').trim(),
        protocoloBancario: String(item.protocoloBancario || `RET_${item.tituloId}`).trim(),
        codigoOcorrencia: codigo,
        liquidado,
        valorCents,
        valor: fromCents(valorCents)
      };
    });
  }

  const texto = String(entrada || '');
  const linhas = texto.split(/\r?\n/).filter(l => l.length >= 232);
  const itens = [];

  for (const linha of linhas) {
    const tipoRegistro = linha.charAt(7);
    const segmento = linha.charAt(13);
    if (tipoRegistro !== '3' || segmento !== 'A') continue;

    const tituloId = linha.slice(73, 93).trim();
    const valorCents = Number(linha.slice(119, 134));
    const protocoloBancario = linha.slice(134, 154).trim();
    const codigoOcorrencia = linha.slice(230, 232).trim().toUpperCase() || '00';
    const liquidado = codigoOcorrencia === '00' || codigoOcorrencia === 'BD';

    itens.push({
      tituloId,
      protocoloBancario,
      codigoOcorrencia,
      liquidado,
      valorCents,
      valor: fromCents(valorCents)
    });
  }

  return itens;
}

module.exports = {
  calcularRemessa,
  gerarLoteRemessaPagamento,
  parsearRetornoCNAB240
};
