/**
 * Motor de Fluxo de Caixa Projetado x Realizado — packages/motor-repasse/src/fluxoCaixa
 * Agrupa Contas a Receber e Contas a Pagar por data útil bancária e calcula janelas de 30, 60 e 90 dias.
 */

'use strict';

const { toCents, fromCents } = require('../shared/money');

function parseDataBRToUTC(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return null;
  const limpo = dataStr.trim();
  const mBR = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(limpo);
  if (mBR) {
    return new Date(Date.UTC(Number(mBR[3]), Number(mBR[2]) - 1, Number(mBR[1]), 12, 0, 0));
  }
  const mISO = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpo);
  if (mISO) {
    return new Date(Date.UTC(Number(mISO[1]), Number(mISO[2]) - 1, Number(mISO[3]), 12, 0, 0));
  }
  return null;
}

function calcFluxoCaixa({
  contasReceber = [],
  contasPagar = [],
  saldoInicial = 0,
  dataReferencia = '15/10/2026',
  somarDiasUteisFn = null
}) {
  const listaCR = Array.isArray(contasReceber) ? contasReceber : Object.values(contasReceber || {});
  const listaCP = Array.isArray(contasPagar) ? contasPagar : Object.values(contasPagar || {});
  const dtRef = parseDataBRToUTC(dataReferencia) || new Date(Date.UTC(2026, 9, 15, 12, 0, 0));

  const mapaDiario = new Map();

  function garantirDia(dataKey) {
    if (!mapaDiario.has(dataKey)) {
      mapaDiario.set(dataKey, {
        data: dataKey,
        entradasProjetadasCents: 0,
        entradasRealizadasCents: 0,
        saidasProjetadasCents: 0,
        saidasRealizadasCents: 0
      });
    }
    return mapaDiario.get(dataKey);
  }

  for (const cr of listaCR) {
    if (!cr || cr.status === 'Cancelada') continue;
    const dmais = Number(cr.liquidacaoDmais || 0);
    const dataEfetiva = dmais > 0 && typeof somarDiasUteisFn === 'function'
      ? somarDiasUteisFn(cr.vencimento, dmais)
      : (cr.baixadoEm || cr.vencimento);
    const dia = garantirDia(dataEfetiva);
    const cents = cr.valorCents !== undefined ? cr.valorCents : toCents(cr.valor);
    if (cr.status === 'Recebida') {
      dia.entradasRealizadasCents += cents;
    } else {
      dia.entradasProjetadasCents += cents;
    }
  }

  for (const cp of listaCP) {
    if (!cp || cp.status === 'Cancelada') continue;
    const dmais = Number(cp.liquidacaoDmais || 0);
    const dataEfetiva = dmais > 0 && typeof somarDiasUteisFn === 'function'
      ? somarDiasUteisFn(cp.vencimento, dmais)
      : (cp.baixadoEm || cp.vencimento);
    const dia = garantirDia(dataEfetiva);
    const cents = cp.valorCents !== undefined ? cp.valorCents : toCents(cp.valor);
    if (cp.status === 'Paga') {
      dia.saidasRealizadasCents += cents;
    } else {
      dia.saidasProjetadasCents += cents;
    }
  }

  const diasOrdenados = Array.from(mapaDiario.values()).sort((a, b) => {
    const da = parseDataBRToUTC(a.data);
    const db = parseDataBRToUTC(b.data);
    return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
  });

  let acumuladoRealizadoCents = toCents(saldoInicial);
  let acumuladoProjetadoCents = toCents(saldoInicial);

  const serieDiaria = diasOrdenados.map(d => {
    const liqRealizado = d.entradasRealizadasCents - d.saidasRealizadasCents;
    const liqProjetado = (d.entradasRealizadasCents + d.entradasProjetadasCents) -
      (d.saidasRealizadasCents + d.saidasProjetadasCents);

    acumuladoRealizadoCents += liqRealizado;
    acumuladoProjetadoCents += liqProjetado;

    return {
      data: d.data,
      entradasProjetadas: fromCents(d.entradasProjetadasCents),
      entradasRealizadas: fromCents(d.entradasRealizadasCents),
      saidasProjetadas: fromCents(d.saidasProjetadasCents),
      saidasRealizadas: fromCents(d.saidasRealizadasCents),
      saldoDiaRealizado: fromCents(liqRealizado),
      saldoDiaProjetado: fromCents(liqProjetado),
      saldoAcumuladoRealizado: fromCents(acumuladoRealizadoCents),
      saldoAcumuladoProjetado: fromCents(acumuladoProjetadoCents)
    };
  });

  function calcularJanela(diasHorizonte) {
    const limiteMs = dtRef.getTime() + diasHorizonte * 24 * 60 * 60 * 1000;
    let entProj = 0;
    let saiProj = 0;
    let entReal = 0;
    let saiReal = 0;

    for (const d of diasOrdenados) {
      const dt = parseDataBRToUTC(d.data);
      if (dt && dt.getTime() <= limiteMs) {
        entProj += d.entradasProjetadasCents;
        saiProj += d.saidasProjetadasCents;
        entReal += d.entradasRealizadasCents;
        saiReal += d.saidasRealizadasCents;
      }
    }

    const saldoProjetadoFinalCents = toCents(saldoInicial) + entReal + entProj - saiReal - saiProj;
    return {
      diasHorizonte,
      entradasProjetadas: fromCents(entProj),
      saidasProjetadas: fromCents(saiProj),
      entradasRealizadas: fromCents(entReal),
      saidasRealizadas: fromCents(saiReal),
      saldoProjetadoFinal: fromCents(saldoProjetadoFinalCents)
    };
  }

  return {
    saldoInicial: fromCents(toCents(saldoInicial)),
    dataReferencia,
    serieDiaria,
    janelas: {
      d30: calcularJanela(30),
      d60: calcularJanela(60),
      d90: calcularJanela(90)
    }
  };
}

module.exports = {
  calcFluxoCaixa
};
