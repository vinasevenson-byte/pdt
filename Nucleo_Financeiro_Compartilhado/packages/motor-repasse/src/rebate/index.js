/**
 * Motor de Rebate Comercial — packages/motor-repasse/src/rebate
 * Regra: Crédito comercial concedido sobre bilheteria ou valor fixo, estritamente
 * limitado à Taxa Adm disponível do Disk (mesmo teto aplicado ao patrocínio).
 */

'use strict';

const { toCents, fromCents, mulPct } = require('../shared/money');

function calcRebate({
  bilheteria = 0,
  taxaAdm = 0,
  patrocinioJaAlocado = 0,
  regraRebate = { ativo: false, tipo: 'percentual', valor: 0 }
}) {
  const bilCents = toCents(bilheteria);
  const taxaAdmCents = toCents(taxaAdm);
  const patCents = toCents(patrocinioJaAlocado);
  const tetoDisponivelCents = Math.max(0, taxaAdmCents - patCents);

  if (!regraRebate || !regraRebate.ativo) {
    return {
      ativo: false,
      rebateBrutoCents: 0,
      rebateBruto: 0,
      rebateCreditadoCents: 0,
      rebateCreditado: 0,
      excedenteBloqueadoCents: 0,
      excedenteBloqueado: 0,
      taxaAdmRestanteCents: tetoDisponivelCents,
      taxaAdmRestante: fromCents(tetoDisponivelCents)
    };
  }

  const rebateBrutoCents = regraRebate.tipo === 'percentual'
    ? toCents(mulPct(fromCents(bilCents), regraRebate.valor))
    : toCents(regraRebate.valor);

  const rebateCreditadoCents = Math.min(Math.max(0, rebateBrutoCents), tetoDisponivelCents);
  const excedenteBloqueadoCents = Math.max(0, rebateBrutoCents - rebateCreditadoCents);
  const taxaAdmRestanteCents = Math.max(0, tetoDisponivelCents - rebateCreditadoCents);

  return {
    ativo: true,
    rebateBrutoCents,
    rebateBruto: fromCents(rebateBrutoCents),
    rebateCreditadoCents,
    rebateCreditado: fromCents(rebateCreditadoCents),
    excedenteBloqueadoCents,
    excedenteBloqueado: fromCents(excedenteBloqueadoCents),
    taxaAdmRestanteCents,
    taxaAdmRestante: fromCents(taxaAdmRestanteCents)
  };
}

module.exports = {
  calcRebate
};
