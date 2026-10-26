/**
 * Hub de Repasses DiskIngressos — Entrypoint Cloud Functions v2 (southamerica-east1)
 */

'use strict';

const { functionsV2 } = require('./shared/recalculo');

functionsV2.setGlobalOptions({ region: 'southamerica-east1' });

const triggers = require('./triggers');
const callables = require('./callables');
const financeiroCore = require('./modules/financeiro_core');
const verticalModules = require('./modules/generatedModules');

module.exports = {
  ...triggers,
  ...callables,
  ...financeiroCore,
  ...verticalModules
};
