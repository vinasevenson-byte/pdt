import type { ReactNode } from 'react';

export interface FinancialModulePlugin {
  id: string;
  title: string;
  description: string;
  rtdbNode: string;
  requiresJavaService?: boolean;
  render: () => ReactNode;
}
