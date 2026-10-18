export interface FirebaseProjectConfig {
  projectId: string;
  databaseURL: string;
  region: string;
}

export interface UserClaimsInfo {
  role: 'financeiro' | 'produtor' | null;
  produtoraId: string | null;
  isFinanceiro: boolean;
  isProdutor: boolean;
}

export const FIREBASE_PROJECT_CONFIG: FirebaseProjectConfig;
export function extrairClaims(tokenResult?: Record<string, unknown>): UserClaimsInfo;
export function criarPayloadAuditoria(params: {
  usuario: string;
  modulo: string;
  eventoId?: string;
  acao: string;
  resumo: string;
}): {
  dataHora: string;
  usuario: string;
  modulo: string;
  eventoId: string;
  acao: string;
  resumo: string;
};
