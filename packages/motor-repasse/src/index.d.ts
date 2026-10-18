export interface SetorLocal {
  nome: string;
  capacidade: number;
}

export interface LocalEvento {
  nome?: string;
  cidade?: string;
  uf?: string;
  capacidadeTotal?: number;
  setores?: SetorLocal[];
}

export interface CapacidadeInfo {
  capacidadeUsada: number;
  vendidos: number;
  cortesias: number;
  contarCortesias: boolean;
  ingressosContados: number;
  pctVendido: number;
}

export interface FaixaRegra {
  gatilhoPct: number;
  liberaPct: number;
}

export interface ProximaFaixaInfo extends FaixaRegra {
  ingressosFaltantes: number;
}

export interface CalcEventoResult {
  capacidadeUsada: number;
  vendidos: number;
  cortesias: number;
  ingressosContados: number;
  pctVendido: number;
  bil: number;
  taxaAdm: number;
  taxaOp: number;
  receitaDiskLiquida: number;
  despesas: number;
  despesasPagas: number;
  despesasAPagar: number;
  despesasTotal: number;
  abaterDespesasAPagar: boolean;
  totRetencoes: number;
  totOps: number;
  reserva: number;
  resultado: number;
  rebateBruto: number;
  rebate: number;
  patrocinioBruto: number;
  patrocinio: number;
  excedente: number;
  taxaAdmLiquida: number;
  creditos: number;
  creditosSujeitosTrava: boolean;
  basePositiva: number;
  pctResultado: number;
  liberaPctB: number;
  A: number;
  B: number;
  modo: 'MIN' | 'A' | 'B';
  teto: number;
  liberaTotalDmais: number;
  dataLiberacaoTotal: string;
  liberadoPosEvento: boolean;
  escolhido: number;
  liberadoRegra: number;
  jaRepassado: number;
  advEv: number;
  antEv: number;
  bruto: number;
  liberavel: number;
  saldoDevedor: number;
  retido: number;
  faixaAtual: FaixaRegra | null;
  faixas: FaixaRegra[];
  proximaFaixa: ProximaFaixaInfo | null;
  retencoesDetalhe: Array<Record<string, unknown>>;
  descontosDetalhe: Array<Record<string, unknown>>;
}

export interface CalcConsolidadoResult {
  eventosLiberadosIds: string[];
  liberavelEventos: number;
  taxaAdmLiqTotal: number;
  patrocinioProdutoraBruto: number;
  patrocinioProdutora: number;
  excedentePatrocinioProdutora: number;
  advConsolidado: number;
  devedores: number;
  saldoDisponivel: number;
  disponivel: (selecaoIds: string[]) => number;
}

export interface BorderoProdutor {
  borderoEvento: number;
  despesas: number;
  despesasPagas: number;
  despesasAPagar: number;
  retencoes: Array<{ nome: string; valor: number; status: string }>;
  descontosOperacionais: Array<{ nome: string; qtd: number; unit: number; valor: number }>;
  resultado: number;
  regraTexto: string;
  faixaAtual: FaixaRegra | null;
  faixas: FaixaRegra[];
  pctVendido: number;
  capacidadeUsada: number;
  vendidosAtuais: number;
  pctResultadoRegra: number;
  modoRegra: string;
  proximaFaixa: ProximaFaixaInfo | null;
  liberaTotalDmais: number;
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

export function capacidadeUsada(evento?: Record<string, unknown>, local?: LocalEvento): CapacidadeInfo;
export function calcEvento(
  evento?: Record<string, unknown>,
  fin?: Record<string, unknown>,
  negociacao?: Record<string, unknown>,
  despesasLancadas?: unknown[] | number,
  advancedEvento?: unknown[] | number,
  antecipacoesEvento?: unknown[] | number,
  local?: LocalEvento
): CalcEventoResult;
export function calcConsolidado(
  produtora?: Record<string, unknown>,
  eventosCalculados?: unknown[] | Record<string, unknown>,
  advanced?: unknown[] | Record<string, unknown>
): CalcConsolidadoResult;
export function bordero_produtor(calc?: Partial<CalcEventoResult>): BorderoProdutor;
export function ehDiaUtilBancario(dateUTC: Date): boolean;
export function somarDiasUteis(dataStr: string, diasUteis?: number): string;
export function calcularDataLiberacaoPosEvento(
  dataEventoStr: string,
  liberaTotalDmais?: number,
  dataReferenciaStr?: string | null
): { diasUteis: number; dataLiberacaoTotal: string; liberadoPosEvento: boolean };
export function calcTransferencia(
  valorSolicitado: number,
  forma?: 'PIX' | 'TED',
  configTransferencia?: { pixValor?: number; tedValor?: number }
): {
  forma: 'PIX' | 'TED';
  valorBruto: number;
  tarifa: number;
  tarifaPix: number;
  tarifaTed: number;
  valorLiquido: number;
};
export function calcularRateioRepasse(
  eventosSelecionados: Array<{ id: string; liberavel?: number }>,
  valorSolicitado: number,
  modoRateio?: 'proporcional' | 'manual',
  rateioManual?: Record<string, number>
): {
  modoRateio: 'proporcional' | 'manual';
  valido: boolean;
  erro: string | null;
  quotasPorEvento: Record<string, number>;
  somaQuotas: number;
};
export function simularVendasEvento(
  evento?: Record<string, unknown>,
  fin?: Record<string, unknown>,
  negociacao?: Record<string, unknown>,
  despesasLancadas?: unknown[],
  advancedEvento?: unknown[],
  antecipacoesEvento?: unknown[],
  local?: LocalEvento,
  novosVendidos?: number | null,
  metaLiberavelDesejada?: number | null
): Record<string, unknown>;
