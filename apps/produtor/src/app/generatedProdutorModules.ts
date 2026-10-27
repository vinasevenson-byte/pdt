/**
 * ARQUIVO GERADO AUTOMATICAMENTE POR `npm run module:build` — NÃO EDITE MANUALMENTE.
 */
import type React from 'react';
import { ProdutorModuleView as comercial_contratos_Produtor } from '../../../../modules/comercial/contratos/ui-produtor';
import { ProdutorModuleView as operacao_vendas_Produtor } from '../../../../modules/operacao/vendas/ui-produtor';

export interface VerticalProdutorModuleEntry {
  id: string;
  title: string;
  Component: React.ComponentType<Record<string, unknown>>;
}

export const VERTICAL_PRODUTOR_MODULES: VerticalProdutorModuleEntry[] = [
  { id: 'contratos', title: 'Contratos', Component: comercial_contratos_Produtor },
  { id: 'vendas', title: 'Vendas, Lotes e Cortesias', Component: operacao_vendas_Produtor }
];
