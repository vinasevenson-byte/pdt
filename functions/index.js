/**
 * Hub de Repasses DiskIngressos — Entrypoint unificado de Cloud Functions v2
 * Delega 100% para services/functions/src/index.js (fonte única da verdade).
 */
'use strict';

module.exports = require('../services/functions/src/index.js');
