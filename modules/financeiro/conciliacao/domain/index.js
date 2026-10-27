/**
 * Domínio Puro (em centavos) — Módulo Conciliação Bancária e Adquirência (financeiro/conciliacao)
 * - Parser puro de extratos OFX 1.02 (SGML) e OFX 2.x (XML)
 * - Pareamento determinístico (protocolo exato, data+valor com janela de tolerância, detecção de ambiguidade e divergência)
 */
'use strict';

const crypto = require('node:crypto');

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function extrairTagOFX(bloco, tag) {
  const reXml = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const mXml = reXml.exec(bloco);
  if (mXml) return mXml[1].trim();

  const reSgml = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
  const mSgml = reSgml.exec(bloco);
  return mSgml ? mSgml[1].trim() : '';
}

function converterDataOFXParaBR(dtOfx = '') {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(dtOfx || '').trim());
  if (!m) return { data: '', competencia: '' };
  return {
    data: `${m[3]}/${m[2]}/${m[1]}`,
    competencia: `${m[1]}-${m[2]}`
  };
}

function converterDataParaEpochDias(dataStr = '') {
  const s = String(dataStr || '').trim();
  const mBR = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (mBR) {
    return Math.floor(Date.UTC(Number(mBR[3]), Number(mBR[2]) - 1, Number(mBR[1])) / 86400000);
  }
  const mISO = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (mISO) {
    return Math.floor(Date.UTC(Number(mISO[1]), Number(mISO[2]) - 1, Number(mISO[3])) / 86400000);
  }
  return null;
}

/**
 * Faz o parse de um arquivo OFX 1.02 (SGML) ou 2.x (XML), retornando metadados da conta,
 * lista de transações em centavos inteiros e hash SHA-256 do extrato para evitar importação duplicada.
 */
function parsearExtratoOFX(conteudoOfx = '') {
  const texto = String(conteudoOfx || '').trim();
  if (!texto || !/<OFX/i.test(texto)) {
    throw new Error('Conteúdo OFX inválido: bloco <OFX> não encontrado.');
  }

  const bankId = extrairTagOFX(texto, 'BANKID');
  const branchId = extrairTagOFX(texto, 'BRANCHID');
  const acctId = extrairTagOFX(texto, 'ACCTID');
  const curDef = extrairTagOFX(texto, 'CURDEF') || 'BRL';
  const dtStartRaw = extrairTagOFX(texto, 'DTSTART');
  const dtEndRaw = extrairTagOFX(texto, 'DTEND');
  const balAmtRaw = extrairTagOFX(texto, 'BALAMT').replace(',', '.');

  // Extrai blocos <STMTTRN> tanto em XML (<STMTTRN>...</STMTTRN>) quanto SGML (<STMTTRN>...próximo <STMTTRN> ou </BANKTRANLIST>)
  const blocos = [];
  const partes = texto.split(/<STMTTRN>/i).slice(1);
  for (const p of partes) {
    const fim = p.search(/<\/STMTTRN>|<\/BANKTRANLIST>/i);
    blocos.push(fim >= 0 ? p.slice(0, fim) : p);
  }

  const transacoes = blocos.map((bloco, idx) => {
    const trnType = extrairTagOFX(bloco, 'TRNTYPE') || 'OTHER';
    const dtPosted = extrairTagOFX(bloco, 'DTPOSTED');
    const trnAmtStr = extrairTagOFX(bloco, 'TRNAMT').replace(',', '.');
    const fitId = extrairTagOFX(bloco, 'FITID') || `fit_${idx + 1}`;
    const checkNum = extrairTagOFX(bloco, 'CHECKNUM');
    const refNum = extrairTagOFX(bloco, 'REFNUM');
    const memo = extrairTagOFX(bloco, 'MEMO') || extrairTagOFX(bloco, 'NAME') || '';

    const valorAssinado = Number(trnAmtStr || 0);
    const valorAssinadoCents = toCents(valorAssinado);
    const valorCents = Math.abs(valorAssinadoCents);
    const natureza = valorAssinadoCents < 0 ? 'DEBITO' : 'CREDITO';
    const { data, competencia } = converterDataOFXParaBR(dtPosted);

    // Extrai protocolo candidato (CHECKNUM, REFNUM, padrão PIX-xxx/TED-xxx no MEMO ou FITID)
    const matchProtoMemo = /\b((?:PIX|TED|DOC|DEV|ANT|REP)[-_][A-Za-z0-9_-]+)\b/i.exec(memo);
    const protocolo = checkNum || refNum || (matchProtoMemo ? matchProtoMemo[1] : fitId);

    return {
      id: fitId,
      fitId,
      tipo: trnType,
      natureza,
      data,
      competencia,
      valorAssinadoCents,
      valorCents,
      valor: fromCents(valorCents),
      protocolo,
      historico: memo
    };
  });

  const competenciasEncontradas = Array.from(
    new Set(transacoes.map(t => t.competencia).filter(Boolean))
  ).sort();
  const competenciaPrincipal =
    competenciasEncontradas[0] ||
    converterDataOFXParaBR(dtEndRaw).competencia ||
    converterDataOFXParaBR(dtStartRaw).competencia ||
    '';

  const hashArquivo = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        bankId,
        acctId,
        transacoes: transacoes.map(t => ({
          fitId: t.fitId,
          data: t.data,
          valorAssinadoCents: t.valorAssinadoCents,
          protocolo: t.protocolo
        }))
      }),
      'utf8'
    )
    .digest('hex');

  return {
    banco: {
      bankId,
      branchId,
      acctId,
      moeda: curDef,
      saldoFinalCents: balAmtRaw ? toCents(Number(balAmtRaw)) : null,
      saldoFinal: balAmtRaw ? fromCents(toCents(Number(balAmtRaw))) : null
    },
    competencia: competenciaPrincipal,
    hashArquivo,
    quantidadeTransacoes: transacoes.length,
    transacoes
  };
}

function calcularConciliacao(registro = {}) {
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
 * Concilia linhas do extrato bancário (ou transações OFX) contra lançamentos do Ledger (/lancamentos) em centavos inteiros.
 * Regras:
 * 1. Pareamento exato por protocolo/documento/FITID; se o valor divergir, registra em `divergentesValor`.
 * 2. Se não houver protocolo único, tenta parear por valor exato em centavos + data dentro de `toleranciaDias` (padrão: 2 dias).
 *    - Se encontrar exatamente 1 candidato no Ledger, concilia com `pareamento: 'data_e_valor'`.
 *    - Se encontrar 2 ou mais candidatos idênticos na janela de data, NUNCA chuta: classifica em `ambiguidades` para decisão manual.
 */
function conciliarExtratoBancario({
  itensExtrato = [],
  lancamentosLedger = [],
  toleranciaDias = 2
} = {}) {
  const extratoList = Array.isArray(itensExtrato) ? itensExtrato : Object.values(itensExtrato || {});
  const ledgerList = (
    Array.isArray(lancamentosLedger)
      ? lancamentosLedger.map((l, idx) => ({ ...l, id: l.id || `lnc_${idx}` }))
      : Object.entries(lancamentosLedger || {}).map(([id, l]) => ({ ...l, id: l.id || id }))
  ).filter(Boolean);

  const conciliados = [];
  const divergentesValor = [];
  const ambiguidades = [];
  const pendentesExtrato = [];
  const ledgerUsadosIds = new Set();

  for (const item of extratoList) {
    const proto = String(item.protocolo || item.documento || item.fitId || '').trim();
    const valorExtCents =
      item.valorCents !== undefined && Number.isFinite(Number(item.valorCents))
        ? Math.abs(Math.round(Number(item.valorCents)))
        : Math.abs(toCents(item.valor || 0));

    // 1. Tenta match determinístico por protocolo
    const candidatoProtocolo = proto
      ? ledgerList.find(l => {
          if (!l || ledgerUsadosIds.has(l.id)) return false;
          const hist = String(l.historico || '');
          const origId = String(l.origemId || '');
          return hist.includes(proto) || origId === proto || l.protocoloBancario === proto;
        })
      : null;

    if (candidatoProtocolo) {
      ledgerUsadosIds.add(candidatoProtocolo.id);
      const valorLedgerCents =
        candidatoProtocolo.valorCents !== undefined
          ? Number(candidatoProtocolo.valorCents)
          : toCents(candidatoProtocolo.valor || 0);
      const diffCents = valorExtCents - valorLedgerCents;

      if (diffCents === 0) {
        conciliados.push({
          pareamento: 'exato_protocolo',
          protocolo: proto,
          extratoId: item.id || item.fitId || null,
          lancamentoId: candidatoProtocolo.id,
          valorCents: valorExtCents,
          valor: fromCents(valorExtCents)
        });
      } else {
        divergentesValor.push({
          protocolo: proto,
          extratoId: item.id || item.fitId || null,
          lancamentoId: candidatoProtocolo.id,
          valorExtratoCents: valorExtCents,
          valorLedgerCents,
          diferencaCents: diffCents,
          diferenca: fromCents(diffCents)
        });
      }
      continue;
    }

    // 2. Fallback por valor exato em centavos + proximidade de data (se o item do extrato possuir data)
    const diasExt = converterDataParaEpochDias(item.data || '');
    if (diasExt !== null) {
      const candidatosValorData = ledgerList.filter(l => {
        if (!l || ledgerUsadosIds.has(l.id)) return false;
        const lCents = l.valorCents !== undefined ? Number(l.valorCents) : toCents(l.valor || 0);
        if (lCents !== valorExtCents) return false;
        const diasLanc = converterDataParaEpochDias(l.data || l.dataLancamento || '');
        if (diasLanc === null) return false;
        return Math.abs(diasExt - diasLanc) <= toleranciaDias;
      });

      if (candidatosValorData.length === 1) {
        const unico = candidatosValorData[0];
        ledgerUsadosIds.add(unico.id);
        conciliados.push({
          pareamento: 'data_e_valor',
          protocolo: proto || null,
          extratoId: item.id || item.fitId || null,
          lancamentoId: unico.id,
          valorCents: valorExtCents,
          valor: fromCents(valorExtCents)
        });
        continue;
      }

      if (candidatosValorData.length > 1) {
        ambiguidades.push({
          extratoId: item.id || item.fitId || null,
          data: item.data,
          valorCents: valorExtCents,
          valor: fromCents(valorExtCents),
          candidatosLedgerIds: candidatosValorData.map(c => c.id)
        });
        continue;
      }
    }

    pendentesExtrato.push({
      ...item,
      extratoId: item.id || item.fitId || null,
      valorCents: valorExtCents,
      valor: fromCents(valorExtCents)
    });
  }

  const pendentesLedger = ledgerList.filter(l => l && !ledgerUsadosIds.has(l.id));
  const somaExtratoCents = extratoList.reduce(
    (acc, i) =>
      acc +
      (i.valorCents !== undefined ? Math.abs(Math.round(Number(i.valorCents))) : Math.abs(toCents(i.valor || 0))),
    0
  );
  const somaLedgerCents = ledgerList.reduce(
    (acc, l) => acc + (l.valorCents !== undefined ? Number(l.valorCents) : toCents(l.valor || 0)),
    0
  );

  return {
    conciliados,
    divergentesValor,
    ambiguidades,
    pendentesExtrato,
    pendentesLedger,
    somaExtratoCents,
    somaExtrato: fromCents(somaExtratoCents),
    somaLedgerCents,
    somaLedger: fromCents(somaLedgerCents),
    diferencaTotalCents: somaExtratoCents - somaLedgerCents,
    diferencaTotal: fromCents(somaExtratoCents - somaLedgerCents),
    conciliadoComSucesso:
      divergentesValor.length === 0 &&
      ambiguidades.length === 0 &&
      pendentesExtrato.length === 0 &&
      pendentesLedger.length === 0
  };
}

module.exports = {
  calcularConciliacao,
  parsearExtratoOFX,
  conciliarExtratoBancario
};
