/**
 * Projeção limpa autorizada para o Portal do Produtor.
 * Consome exclusivamente os nós permitidos pelas regras de segurança:
 * - /borderos_produtor/{produtoraId}
 * - /extrato_produtor/{produtoraId}
 * - /contas/{produtoraId}
 * - /repasses, /antecipacoes, /despesas (filtrados por produtoraId)
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
  status: 'Solicitado' | 'Aprovado' | 'Pago' | 'Recusado';
  solicitadoEm: string;
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
}

export const PROJECAO_INICIAL_PRODUTOR = {
  produtoraId: 'prod_exemplo',
  produtoraNome: 'Produtora Exemplo Curitiba Ltda',
  cnpj: '14.890.321/0001-55',
  antecipacaoConfig: {
    pctLimite: 50,
    percentualEncargo: 2
  },
  consolidado: {
    liberavelEventos: 5056,
    patrocinioProdutora: 1000,
    patrocinioDescricao: 'Patrocínio master da temporada',
    advConsolidado: 2000,
    devedores: 0,
    saldoDisponivel: 4056,
    tarifaPix: 0,
    tarifaTed: 10
  } as ConsolidadoProdutorLimpo,
  eventos: [
    {
      id: 'polaquedo',
      nome: 'Polaquedo',
      data: '03/10/2026',
      local: 'Espaço Cultural Polaquedo · Curitiba/PR',
      liberadoParaSolicitacao: true,
      borderoEvento: 5400,
      despesas: 0,
      despesasPagas: 0,
      despesasAPagar: 500,
      retencoes: [
        { nome: 'ISS', valor: 300, status: 'provisionado' },
        { nome: 'ECAD', valor: 600, status: 'provisionado' },
        { nome: 'Locação', valor: 2000, status: 'provisionado' },
        { nome: 'Segurança', valor: 800, status: 'provisionado' }
      ],
      descontosOperacionais: [
        { nome: 'Bilheteiros', qtd: 2, unit: 150, valor: 300 },
        { nome: 'Validadores', qtd: 2, unit: 100, valor: 200 }
      ],
      resultado: 1200,
      regraTexto: 'Faixa atual: 20% do resultado (capacidade vendida 30%). Vale o menor entre esse valor e 60% do resultado. Liberação de 100% em 06/10/2026 (D+2 dias úteis bancários).',
      faixaAtual: { gatilhoPct: 30, liberaPct: 20 },
      faixas: [
        { gatilhoPct: 30, liberaPct: 20 },
        { gatilhoPct: 50, liberaPct: 40 },
        { gatilhoPct: 80, liberaPct: 70 }
      ],
      pctVendido: 30,
      vendidosAtuais: 150,
      capacidadeUsada: 500,
      proximaFaixa: { gatilhoPct: 50, liberaPct: 40, ingressosFaltantes: 100 },
      dataLiberacaoTotal: '06/10/2026',
      escolhido: 240,
      rebate: 0,
      patrocinio: 0,
      jaRepassado: 0,
      advEv: 0,
      antEv: 0,
      liberavel: 240,
      retido: 960
    },
    {
      id: 'festival',
      nome: 'Festival de Inverno',
      data: '22/11/2026',
      local: 'Teatro Guaíra · Curitiba/PR',
      liberadoParaSolicitacao: true,
      borderoEvento: 66240,
      despesas: 2000,
      despesasPagas: 2000,
      despesasAPagar: 0,
      retencoes: [
        { nome: 'ISS', valor: 3600, status: 'provisionado' },
        { nome: 'ECAD', valor: 7200, status: 'provisionado' },
        { nome: 'Locação', valor: 15000, status: 'provisionado' },
        { nome: 'Brigada', valor: 1500, status: 'provisionado' }
      ],
      descontosOperacionais: [
        { nome: 'Bilheteiros', qtd: 4, unit: 150, valor: 600 },
        { nome: 'Técnicos', qtd: 2, unit: 400, valor: 800 },
        { nome: 'Validadores', qtd: 6, unit: 100, valor: 600 },
        { nome: 'Hospedagem', qtd: 2, unit: 350, valor: 700 },
        { nome: 'Deslocamento', qtd: 1, unit: 1200, valor: 1200 }
      ],
      resultado: 33040,
      regraTexto: 'Faixa atual: 40% do resultado (capacidade vendida 60%). Vale o menor entre esse valor e 60% do resultado. Liberação de 100% em 24/11/2026 (D+2 dias úteis bancários).',
      faixaAtual: { gatilhoPct: 50, liberaPct: 40 },
      faixas: [
        { gatilhoPct: 30, liberaPct: 20 },
        { gatilhoPct: 50, liberaPct: 40 },
        { gatilhoPct: 80, liberaPct: 70 }
      ],
      pctVendido: 60,
      vendidosAtuais: 720,
      capacidadeUsada: 1200,
      proximaFaixa: { gatilhoPct: 80, liberaPct: 70, ingressosFaltantes: 240 },
      dataLiberacaoTotal: '24/11/2026',
      escolhido: 13216,
      rebate: 720,
      patrocinio: 2000,
      jaRepassado: 5000,
      advEv: 0,
      antEv: 6120,
      liberavel: 4816,
      retido: 19824
    },
    {
      id: 'standup',
      nome: 'Noite de Stand-up',
      data: '14/12/2026',
      local: 'Auditório Curitiba Comedy · Curitiba/PR',
      liberadoParaSolicitacao: true,
      borderoEvento: 3120,
      despesas: 0,
      despesasPagas: 0,
      despesasAPagar: 0,
      retencoes: [
        { nome: 'ISS', valor: 180, status: 'provisionado' },
        { nome: 'Locação', valor: 1500, status: 'provisionado' }
      ],
      descontosOperacionais: [],
      resultado: 1440,
      regraTexto: 'Repasse liberado a partir de 30% da capacidade vendida. Hoje: 7,5%. Liberação de 100% em 16/12/2026 (D+2 dias úteis bancários).',
      faixaAtual: null,
      faixas: [
        { gatilhoPct: 30, liberaPct: 20 },
        { gatilhoPct: 50, liberaPct: 40 },
        { gatilhoPct: 80, liberaPct: 70 }
      ],
      pctVendido: 7.5,
      vendidosAtuais: 60,
      capacidadeUsada: 800,
      proximaFaixa: { gatilhoPct: 30, liberaPct: 20, ingressosFaltantes: 180 },
      dataLiberacaoTotal: '16/12/2026',
      escolhido: 0,
      rebate: 0,
      patrocinio: 0,
      jaRepassado: 0,
      advEv: 0,
      antEv: 0,
      liberavel: 0,
      retido: 1440
    }
  ] as BorderoEventoLimpo[],
  contas: [
    {
      id: 'c1',
      banco: '341 · Itaú Unibanco',
      agencia: '0392',
      conta: '44910-8',
      pix: '14.890.321/0001-55 (CNPJ)',
      titular: 'Produtora Exemplo Curitiba Ltda',
      status: 'Validada',
      padrao: true
    },
    {
      id: 'c2',
      banco: '756 · Sicoob Sul',
      agencia: '4102',
      conta: '88210-3',
      pix: 'financeiro@produtoraexemplo.com.br',
      titular: 'Produtora Exemplo Curitiba Ltda',
      status: 'Pendente',
      padrao: false
    }
  ] as ContaBancariaProdutor[],
  repasses: [
    {
      id: 'rep_hist_1',
      eventoIds: ['festival'],
      valorSolicitado: 5000,
      tarifaTransferencia: 10,
      valorLiquido: 4990,
      forma: 'TED',
      contaId: 'c1',
      status: 'Pago',
      solicitadoEm: '05/10/2026 14:15'
    }
  ] as RepasseHistoricoProdutor[],
  antecipacoes: [
    {
      id: 'ant_1',
      eventoId: 'festival',
      data: '10/10/2026',
      valor: 6000,
      percentualEncargo: 2,
      status: 'Aprovada'
    }
  ] as AntecipacaoProdutor[],
  despesas: [
    {
      id: 'desp_1',
      eventoId: 'festival',
      data: '02/10/2026',
      categoria: 'Material gráfico',
      fornecedor: 'Gráfica Curitiba',
      valor: 1200,
      status: 'Pago',
      nfCodigo: 'NF-e 000.418.220'
    },
    {
      id: 'desp_2',
      eventoId: 'festival',
      data: '06/10/2026',
      categoria: 'Som e luz extra',
      fornecedor: 'AudioSul Locação',
      valor: 800,
      status: 'Pago',
      nfCodigo: 'NFS-e 2026/8891'
    },
    {
      id: 'desp_3',
      eventoId: 'polaquedo',
      data: '12/10/2026',
      categoria: 'Camarim',
      fornecedor: 'Buffet Eventos PR',
      valor: 500,
      status: 'A pagar',
      nfCodigo: 'Orçamento #991'
    }
  ] as DespesaEventoProdutor[]
};
