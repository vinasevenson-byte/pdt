import type { ReactNode } from 'react';
import type { EstadoFinanceiroRTDB, SessaoFinanceiro } from './firebaseFinanceiro';

export type FinancialModuleGroupId =
  | 'inicio'
  | 'cadastros'
  | 'saldos_repasses'
  | 'contas_tesouraria'
  | 'vendas_recebiveis'
  | 'operacoes_financeiras'
  | 'compras_fornecedores'
  | 'fechamento_fiscal'
  | 'relatorios_inteligencia'
  | 'governanca_auditoria'
  | 'comercial'
  | 'repasses'
  | 'tesouraria'
  | 'contabil'
  | 'gestao';

export interface FinancialModuleNavContext {
  navegarPara: (moduloId: string, filtroProdutoraId?: string) => void;
  filtroProdutoraId?: string;
  setFiltroProdutoraId?: (produtoraId: string) => void;
  abaInicial?: string;
}

export type ModuloNavegacaoProps = FinancialModuleNavContext;

export interface FinancialModulePlugin {
  id: string;
  title: string;
  shortTitle?: string;
  description: string;
  rtdbNode: string;
  group?: FinancialModuleGroupId;
  order?: number;
  requiresJavaService?: boolean;
  render: (
    dados?: EstadoFinanceiroRTDB,
    sessao?: SessaoFinanceiro | null,
    nav?: FinancialModuleNavContext
  ) => ReactNode;
}
