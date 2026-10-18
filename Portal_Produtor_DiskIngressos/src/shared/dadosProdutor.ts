/**
 * Tipos e Estado Limpo do Portal do Produtor (SEM dados demonstrativos fixos).
 * Todos os dados vêm exclusivamente das leituras autenticadas do Firebase RTDB
 * isoladas por `auth.token.produtoraId`.
 */

export interface RetencaoLimpa {
  nome: string;
  valor: number;
  status: string;
}

export interface DescontoOperacionalLimpo {
  nome: string;
  qtd: number;
  unit: number;
  valor: number;
}

export interface BorderoEventoLimpo {
  id: string;
  nome: string;
  data: string;
  local: string;
  liberadoParaSolicitacao: boolean;
  borderoEvento: number;
  despesas: number;
  despesasPagas: number;
  despesasAPagar: number;
  retencoes: RetencaoLimpa[];
  descontosOperacionais: DescontoOperacionalLimpo[];
  resultado: number;
  regraTexto: string;
  faixaAtual: { gatilhoPct: number; liberaPct: number } | null;
  faixas: Array<{ gatilhoPct: number; liberaPct: number }>;
  pctVendido: number;
  vendidosAtuais: number;
  capacidadeUsada: number;
  proximaFaixa: { gatilhoPct: number; liberaPct: number; ingressosFaltantes: number } | null;
  dataLiberacaoTotal: string;
  escolhido: number;
  rebate: number;
  patrocinio: number;
  jaRepassado: number;
  advEv: number;
  antEv: number;
  liberavel: number;
  retido: number;
}

export interface ConsolidadoProdutorLimpo {
  liberavelEventos: number;
  patrocinioProdutora: number;
  patrocinioDescricao: string;
  advConsolidado: number;
  devedores: number;
  saldoDisponivel: number;
  tarifaPix: number;
  tarifaTed: number;
  atualizadoEm?: string;
}

export interface ContaBancariaProdutor {
  id: string;
  banco: string;
  agencia: string;
  conta: string;
  pix: string;
  titular: string;
  status: 'Validada' | 'Pendente' | 'Recusada';
  padrao: boolean;
}

export interface RepasseHistoricoProdutor {
  id: string;
  eventoIds: string[];
  valorSolicitado: number;
  tarifaTransferencia: number;
  valorLiquido: number;
  forma: 'PIX' | 'TED';
  contaId: string;
  status: 'Solicitado' | 'Aprovado' | 'Pago' | 'Liquidado' | 'Recusado';
  solicitadoEm: string;
  protocoloBancario?: string;
  comprovanteUrl?: string;
  motivoRecusa?: string;
}

export interface AntecipacaoProdutor {
  id: string;
  eventoId: string;
  data: string;
  valor: number;
  percentualEncargo: number;
  status: 'Solicitada' | 'Aprovada' | 'Paga' | 'Recusada';
}

export interface DespesaEventoProdutor {
  id: string;
  eventoId: string;
  data: string;
  categoria: string;
  fornecedor: string;
  valor: number;
  status: 'Pago' | 'A pagar';
  nfCodigo: string;
  comprovanteUrl?: string;
}

export interface EstadoProdutorRTDB {
  carregado: boolean;
  erroLeitura: string | null;
  produtoraId: string;
  produtoraNome: string;
  cnpj: string;
  antecipacaoConfig: {
    pctLimite: number;
    percentualEncargo: number;
  };
  consolidado: ConsolidadoProdutorLimpo;
  eventos: BorderoEventoLimpo[];
  contas: ContaBancariaProdutor[];
  repasses: RepasseHistoricoProdutor[];
  antecipacoes: AntecipacaoProdutor[];
  despesas: DespesaEventoProdutor[];
}

export function criarEstadoProdutorVazio(produtoraId = ''): EstadoProdutorRTDB {
  return {
    carregado: false,
    erroLeitura: null,
    produtoraId,
    produtoraNome: '',
    cnpj: '',
    antecipacaoConfig: {
      pctLimite: 50,
      percentualEncargo: 2
    },
    consolidado: {
      liberavelEventos: 0,
      patrocinioProdutora: 0,
      patrocinioDescricao: 'Patrocínio da produtora',
      advConsolidado: 0,
      devedores: 0,
      saldoDisponivel: 0,
      tarifaPix: 0,
      tarifaTed: 10
    },
    eventos: [],
    contas: [],
    repasses: [],
    antecipacoes: [],
    despesas: []
  };
}
