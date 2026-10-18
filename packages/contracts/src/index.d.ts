export type FormaTransferencia = 'PIX' | 'TED';
export type StatusRepasse = 'Solicitado' | 'Aprovado' | 'Pago' | 'Recusado';
export type StatusAntecipacao = 'Solicitada' | 'Aprovada' | 'Paga' | 'Recusada';
export type StatusConta = 'Pendente' | 'Validada' | 'Recusada';
export type StatusDespesa = 'Pago' | 'A pagar';

export interface SolicitacaoRepassePayload {
  produtoraId: string;
  eventoIds: string[];
  forma: FormaTransferencia;
  valor: number;
  contaId: string;
}

export interface RegistroAuditoria {
  dataHora: string;
  usuario: string;
  modulo: string;
  eventoId?: string;
  acao: string;
  resumo: string;
}

export function validarSolicitacaoRepasse(payload: Partial<SolicitacaoRepassePayload>): {
  valido: boolean;
  erros: string[];
};

export function validarRegistroAuditoria(entry: Partial<RegistroAuditoria>): {
  valido: boolean;
  erros: string[];
};
