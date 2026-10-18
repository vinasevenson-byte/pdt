/**
 * Hub de Repasses DiskIngressos — Entrypoint Cloud Functions v2 (southamerica-east1)
 */

'use strict';

const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'southamerica-east1' });

const triggers = require('./triggers');
const callables = require('./callables');
const financeiroCore = require('./modules/financeiro_core');

module.exports = {
  ...triggers,
  ...callables,
  ...financeiroCore
};
