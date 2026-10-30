/**
 * ARQUIVO GERADO AUTOMATICAMENTE POR `npm run module:build` — NÃO EDITE MANUALMENTE.
 */
import type React from 'react';
import { ProdutorModuleView as comercial_contratos_Produtor } from '../verticals/comercial/contratos/ui-produtor';
import { ProdutorModuleView as financeiro_cobranca_Produtor } from '../verticals/financeiro/cobranca/ui-produtor';
import { ProdutorModuleView as operacao_vendas_Produtor } from '../verticals/operacao/vendas/ui-produtor';
import { ProdutorModuleView as plataforma_notificacoes_Produtor } from '../verticals/plataforma/notificacoes/ui-produtor';

export interface VerticalProdutorModuleEntry {
  id: string;
  title: string;
  Component: React.ComponentType<Record<string, unknown>>;
}

export const VERTICAL_PRODUTOR_MODULES: VerticalProdutorModuleEntry[] = [
  { id: 'contratos', title: 'Contratos', Component: comercial_contratos_Produtor },
  { id: 'cobranca', title: 'Cobrança, Inadimplência e Devedores', Component: financeiro_cobranca_Produtor },
  { id: 'vendas', title: 'Vendas, Lotes e Cortesias', Component: operacao_vendas_Produtor },
  { id: 'notificacoes', title: 'Notificações, Alertas e Jobs', Component: plataforma_notificacoes_Produtor }
];
