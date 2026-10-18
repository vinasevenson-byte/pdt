import type { ReactNode } from 'react';
import type { EstadoFinanceiroRTDB, SessaoFinanceiro } from './firebaseFinanceiro';

export interface FinancialModulePlugin {
  id: string;
  title: string;
  description: string;
  rtdbNode: string;
  requiresJavaService?: boolean;
  render: (dados?: EstadoFinanceiroRTDB, sessao?: SessaoFinanceiro | null) => ReactNode;
}
