import type { ReactNode } from 'react';
import type { EstadoFinanceiroRTDB, SessaoFinanceiro } from './firebaseFinanceiro';

export interface FinancialModuleNavContext {
  navegarPara: (moduloId: string, filtroProdutoraId?: string) => void;
  filtroProdutoraId?: string;
  setFiltroProdutoraId?: (produtoraId: string) => void;
}

export interface FinancialModulePlugin {
  id: string;
  title: string;
  description: string;
  rtdbNode: string;
  requiresJavaService?: boolean;
  render: (
    dados?: EstadoFinanceiroRTDB,
    sessao?: SessaoFinanceiro | null,
    nav?: FinancialModuleNavContext
  ) => ReactNode;
}
