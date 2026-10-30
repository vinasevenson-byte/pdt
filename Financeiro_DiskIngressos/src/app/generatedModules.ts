/**
 * ARQUIVO GERADO AUTOMATICAMENTE POR `npm run module:build` — NÃO EDITE MANUALMENTE.
 */
import type { FinancialModulePlugin } from '../shared/modulePlugin';
import { modulePlugin as admin_auditoria_vis_Plugin } from '../../../modules/admin/auditoria_vis/ui';
import { modulePlugin as admin_fornecedores_Plugin } from '../../../modules/admin/fornecedores/ui';
import { modulePlugin as admin_usuarios_Plugin } from '../../../modules/admin/usuarios/ui';
import { modulePlugin as comercial_contratos_Plugin } from '../../../modules/comercial/contratos/ui';
import { modulePlugin as financeiro_chargebacks_Plugin } from '../../../modules/financeiro/chargebacks/ui';
import { modulePlugin as financeiro_cobranca_Plugin } from '../../../modules/financeiro/cobranca/ui';
import { modulePlugin as financeiro_conciliacao_Plugin } from '../../../modules/financeiro/conciliacao/ui';
import { modulePlugin as financeiro_fiscal_Plugin } from '../../../modules/financeiro/fiscal/ui';
import { modulePlugin as financeiro_recebiveis_Plugin } from '../../../modules/financeiro/recebiveis/ui';
import { modulePlugin as financeiro_remessa_Plugin } from '../../../modules/financeiro/remessa/ui';
import { modulePlugin as operacao_vendas_Plugin } from '../../../modules/operacao/vendas/ui';
import { modulePlugin as plataforma_bi_executivo_Plugin } from '../../../modules/plataforma/bi_executivo/ui';
import { modulePlugin as plataforma_notificacoes_Plugin } from '../../../modules/plataforma/notificacoes/ui';

export const VERTICAL_FINANCEIRO_MODULES: FinancialModulePlugin[] = [
  admin_auditoria_vis_Plugin,
  admin_fornecedores_Plugin,
  admin_usuarios_Plugin,
  comercial_contratos_Plugin,
  financeiro_chargebacks_Plugin,
  financeiro_cobranca_Plugin,
  financeiro_conciliacao_Plugin,
  financeiro_fiscal_Plugin,
  financeiro_recebiveis_Plugin,
  financeiro_remessa_Plugin,
  operacao_vendas_Plugin,
  plataforma_bi_executivo_Plugin,
  plataforma_notificacoes_Plugin
];
