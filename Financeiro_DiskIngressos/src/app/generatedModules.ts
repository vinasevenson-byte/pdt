/**
 * ARQUIVO GERADO AUTOMATICAMENTE POR `npm run module:build` — NÃO EDITE MANUALMENTE.
 */
import type { FinancialModulePlugin } from '../shared/modulePlugin';
import { modulePlugin as comercial_contratos_Plugin } from '../../../../modules/comercial/contratos/ui';
import { modulePlugin as financeiro_chargebacks_Plugin } from '../../../../modules/financeiro/chargebacks/ui';
import { modulePlugin as financeiro_conciliacao_Plugin } from '../../../../modules/financeiro/conciliacao/ui';

export const VERTICAL_FINANCEIRO_MODULES: FinancialModulePlugin[] = [
  comercial_contratos_Plugin,
  financeiro_chargebacks_Plugin,
  financeiro_conciliacao_Plugin
];
