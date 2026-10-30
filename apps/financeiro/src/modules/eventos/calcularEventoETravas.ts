/**
 * Motor de cálculo reativo em centavos inteiros para o módulo "Eventos e Travas" (Painel Financeiro).
 * Implementa exatamente as regras de `packages/motor-repasse/src/index.js`:
 * - Capacidade (local, setores abertos, manual, cortesias)
 * - Taxa Adm Disk, Taxa Operacional, Retenções (ISS, ECAD, Locação, Outras), Descontos Operacionais
 * - Abatimento de Despesas (Pagas + A pagar), Reserva de Reembolso
 * - Créditos Comerciais (Rebate + Patrocínio limitados à Taxa Adm Disk)
 * - Regra de Travas (MIN(A, B), Somente A, Somente B, Teto e Liberação 100% em D+X dias úteis bancários)
 * - Simulador "E se?" (What-If) de vendas, destravamento de faixas e meta de valor liberável
 */

export interface SetorLocal {
  nome: string;
  capacidade: number;
}

export interface LocalData {
  nome: string;
  cidade?: string;
  uf?: string;
  capacidadeTotal: number;
  setores: SetorLocal[];
}

export interface CapacidadeConfig {
  modo: 'local' | 'setores' | 'manual';
  setoresAbertos: string[];
  manual: number;
  contarCortesias: boolean;
}

export interface EventoUI {
  id: string;
  produtoraId: string;
  nome: string;
  data: string;
  localId: string;
  liberadoParaSolicitacao: boolean;
  capacidade: CapacidadeConfig;
  vendas: {
    vendidos: number;
    cortesias: number;
  };
  bilheteria: number;
  jaRepassado: number;
}

export interface RetencaoItem {
  id: string;
  nome: string;
  ativo: boolean;
  tipo: 'percentual' | 'fixo' | 'maiorEntre' | 'porIngresso' | 'porCapacidade';
  base: 'bruto' | 'liquido';
  percentual: number;
  valorFixo: number;
  valorUnitario: number;
  responsavel: 'disk' | 'produtor';
  status: 'provisionado' | 'pago';
}

export interface DescontoOpItem {
  id: string;
  nome: string;
  ativo: boolean;
  quantidade: number;
  valorUnitario: number;
}

export interface FaixaCapacidade {
  gatilhoPct: number;
  liberaPct: number;
}

export interface EventoFinUI {
  taxaAdm: {
    ativo: boolean;
    percentual: number;
  };
  retencoes: RetencaoItem[];
  descontosOperacionais: DescontoOpItem[];
  rebate: {
    ativo: boolean;
    tipo: 'percentual' | 'fixo';
    valor: number;
  };
  patrocinioEvento: {
    ativo: boolean;
    descricao: string;
    valor: number;
  };
  regra: {
    modo: 'MIN' | 'A' | 'B';
    pctResultado: number;
    reservaReembolsoPct: number;
    teto: number;
    liberaTotalDmais: number;
    creditosSujeitosTrava: boolean;
    abaterDespesasAPagar: boolean;
    faixas: FaixaCapacidade[];
  };
}

export interface NegociacaoUI {
  status: 'Ativa' | 'Em revisão' | 'Encerrada';
  taxaOp: {
    tipo: 'porIngresso' | 'percentual' | 'fixo';
    valor: number;
  };
  conveniencia: {
    percentual: number;
  };
  observacoes: string;
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v == null ? '' : v).trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function toCents(valorReais: unknown): number {
  return Math.round((toNum(valorReais) + Number.EPSILON) * 100);
}

function fromCents(valorCents: number): number {
  return Math.round(Number(valorCents || 0)) / 100;
}

function round2(n: unknown): number {
  return fromCents(toCents(n));
}

function addMoney(...valoresReais: number[]): number {
  return fromCents(valoresReais.reduce((acc, v) => acc + toCents(v), 0));
}

function subMoney(aReais: number, bReais: number): number {
  return fromCents(toCents(aReais) - toCents(bReais));
}

function mulPct(valorReais: number, percentual: number): number {
  const cents = toCents(valorReais);
  const pct = toNum(percentual);
  return fromCents(Math.round((cents * pct) / 100));
}

function parseDataBR(dataStr: string): Date | null {
  if (!dataStr) return null;
  const limpo = dataStr.trim();
  const mBR = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(limpo);
  if (mBR) {
    return new Date(Date.UTC(parseInt(mBR[3], 10), parseInt(mBR[2], 10) - 1, parseInt(mBR[1], 10), 12, 0, 0));
  }
  const mISO = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpo);
  if (mISO) {
    return new Date(Date.UTC(parseInt(mISO[1], 10), parseInt(mISO[2], 10) - 1, parseInt(mISO[3], 10), 12, 0, 0));
  }
  return null;
}

function formatarDataBR(dateUTC: Date): string {
  const d = String(dateUTC.getUTCDate()).padStart(2, '0');
  const m = String(dateUTC.getUTCMonth() + 1).padStart(2, '0');
  const y = dateUTC.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

function calcularPascoaUTC(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes, dia, 12, 0, 0));
}

function obterFeriadosNacionaisSet(ano: number): Set<string> {
  const fixos = [
    `01/01/${ano}`,
    `21/04/${ano}`,
    `01/05/${ano}`,
    `07/09/${ano}`,
    `12/10/${ano}`,
    `02/11/${ano}`,
    `15/11/${ano}`,
    `20/11/${ano}`,
    `25/12/${ano}`
  ];
  const pascoa = calcularPascoaUTC(ano);
  const addDias = (dt: Date, dias: number) => {
    const copia = new Date(dt.getTime());
    copia.setUTCDate(copia.getUTCDate() + dias);
    return formatarDataBR(copia);
  };
  fixos.push(addDias(pascoa, -48));
  fixos.push(addDias(pascoa, -47));
  fixos.push(addDias(pascoa, -2));
  fixos.push(addDias(pascoa, 60));
  return new Set(fixos);
}

function ehDiaUtilBancario(dateUTC: Date): boolean {
  const dow = dateUTC.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const feriados = obterFeriadosNacionaisSet(dateUTC.getUTCFullYear());
  return !feriados.has(formatarDataBR(dateUTC));
}

export function somarDiasUteisBR(dataStr: string, diasUteis = 2): string {
  const dt = parseDataBR(dataStr);
  if (!dt) return '';
  const qtd = Math.max(0, Math.floor(toNum(diasUteis)));
  const cursor = new Date(dt.getTime());
  let contados = 0;
  while (contados < qtd) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (ehDiaUtilBancario(cursor)) contados++;
  }
  if (qtd === 0 && !ehDiaUtilBancario(cursor)) {
    while (!ehDiaUtilBancario(cursor)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return formatarDataBR(cursor);
}

export function normalizarLocalUI(raw?: Record<string, unknown>): LocalData {
  const setoresRaw = Array.isArray(raw?.setores) ? raw.setores : [{ nome: 'Pista', capacidade: Number(raw?.capacidadeTotal || 500) }];
  return {
    nome: String(raw?.nome || 'Local do Evento'),
    cidade: String(raw?.cidade || 'Curitiba'),
    uf: String(raw?.uf || 'PR'),
    capacidadeTotal: toNum(raw?.capacidadeTotal || 500),
    setores: setoresRaw.map((s: Record<string, unknown>) => ({
      nome: String(s?.nome || 'Setor'),
      capacidade: toNum(s?.capacidade || 0)
    }))
  };
}

export function normalizarEventoUI(id: string, raw?: Record<string, unknown>, local?: LocalData): EventoUI {
  const capRaw = (raw?.capacidade || {}) as Record<string, unknown>;
  const vendasRaw = (raw?.vendas || {}) as Record<string, unknown>;
  const capDefault = local?.capacidadeTotal || toNum(raw?.capacidadeLiberada || 500);
  return {
    id,
    produtoraId: String(raw?.produtoraId || 'prod_exemplo'),
    nome: String(raw?.nome || id),
    data: String(raw?.data || '03/10/2026'),
    localId: String(raw?.localId || 'loc_polaquedo'),
    liberadoParaSolicitacao: raw?.liberadoParaSolicitacao !== false,
    capacidade: {
      modo: (capRaw.modo as 'local' | 'setores' | 'manual') || 'local',
      setoresAbertos: Array.isArray(capRaw.setoresAbertos)
        ? capRaw.setoresAbertos.map(String)
        : local?.setores.map(s => s.nome) || ['Pista'],
      manual: toNum(capRaw.manual ?? capDefault),
      contarCortesias: Boolean(capRaw.contarCortesias)
    },
    vendas: {
      vendidos: toNum(vendasRaw.vendidos ?? raw?.ingressosVendidos ?? 0),
      cortesias: toNum(vendasRaw.cortesias ?? 0)
    },
    bilheteria: toNum(raw?.bilheteria ?? 0),
    jaRepassado: toNum(raw?.jaRepassado ?? 0)
  };
}

export function normalizarEventoFinUI(raw?: Record<string, unknown>): EventoFinUI {
  const taxaAdmRaw = (raw?.taxaAdm || {}) as Record<string, unknown>;
  const rebateRaw = (raw?.rebate || {}) as Record<string, unknown>;
  const patRaw = (raw?.patrocinioEvento || {}) as Record<string, unknown>;
  const regraRaw = (raw?.regra || {}) as Record<string, unknown>;
  const faixasRaw = Array.isArray(regraRaw.faixas)
    ? regraRaw.faixas
    : [
        { gatilhoPct: 30, liberaPct: 20 },
        { gatilhoPct: 50, liberaPct: 40 },
        { gatilhoPct: 80, liberaPct: 70 }
      ];
  const retRaw = Array.isArray(raw?.retencoes) ? raw.retencoes : [];
  const opsRaw = Array.isArray(raw?.descontosOperacionais) ? raw.descontosOperacionais : [];

  return {
    taxaAdm: {
      ativo: taxaAdmRaw.ativo !== undefined ? Boolean(taxaAdmRaw.ativo) : true,
      percentual: toNum(taxaAdmRaw.percentual ?? raw?.taxaAdmPct ?? 10)
    },
    retencoes: retRaw.map((r: Record<string, unknown>, idx: number) => ({
      id: String(r.id || `ret_${idx}`),
      nome: String(r.nome || 'Retenção'),
      ativo: r.ativo !== undefined ? Boolean(r.ativo) : true,
      tipo: (r.tipo as RetencaoItem['tipo']) || 'percentual',
      base: (r.base as RetencaoItem['base']) || 'bruto',
      percentual: toNum(r.percentual),
      valorFixo: toNum(r.valorFixo),
      valorUnitario: toNum(r.valorUnitario),
      responsavel: (r.responsavel as RetencaoItem['responsavel']) || 'disk',
      status: (r.status as RetencaoItem['status']) || 'provisionado'
    })),
    descontosOperacionais: opsRaw.map((d: Record<string, unknown>, idx: number) => ({
      id: String(d.id || `op_${idx}`),
      nome: String(d.nome || 'Item Operacional'),
      ativo: Boolean(d.ativo),
      quantidade: toNum(d.quantidade),
      valorUnitario: toNum(d.valorUnitario)
    })),
    rebate: {
      ativo: Boolean(rebateRaw.ativo),
      tipo: (rebateRaw.tipo as 'percentual' | 'fixo') || 'percentual',
      valor: toNum(rebateRaw.valor)
    },
    patrocinioEvento: {
      ativo: Boolean(patRaw.ativo),
      descricao: String(patRaw.descricao || ''),
      valor: toNum(patRaw.valor)
    },
    regra: {
      modo: (regraRaw.modo as 'MIN' | 'A' | 'B') || 'MIN',
      pctResultado: toNum(regraRaw.pctResultado ?? 60),
      reservaReembolsoPct: toNum(regraRaw.reservaReembolsoPct ?? 0),
      teto: toNum(regraRaw.teto ?? 0),
      liberaTotalDmais: toNum(regraRaw.liberaTotalDmais ?? 2),
      creditosSujeitosTrava: Boolean(regraRaw.creditosSujeitosTrava),
      abaterDespesasAPagar: regraRaw.abaterDespesasAPagar !== false,
      faixas: faixasRaw.map((f: Record<string, unknown>) => ({
        gatilhoPct: toNum(f.gatilhoPct ?? f.gatilho ?? 30),
        liberaPct: toNum(f.liberaPct ?? f.libera ?? 20)
      }))
    }
  };
}

export function normalizarNegociacaoUI(raw?: Record<string, unknown>): NegociacaoUI {
  const opRaw = (raw?.taxaOp || {}) as Record<string, unknown>;
  const convRaw = (raw?.conveniencia || {}) as Record<string, unknown>;
  const stRaw = String(raw?.status || 'Ativa');
  const status: 'Ativa' | 'Em revisão' | 'Encerrada' =
    stRaw === 'Em revisão' || stRaw === 'Encerrada' ? stRaw : 'Ativa';
  return {
    status,
    taxaOp: {
      tipo: (opRaw.tipo as NegociacaoUI['taxaOp']['tipo']) || (raw?.taxaOpTipo as NegociacaoUI['taxaOp']['tipo']) || 'porIngresso',
      valor: toNum(opRaw.valor ?? raw?.taxaOpValor ?? 0)
    },
    conveniencia: {
      percentual: toNum(convRaw.percentual ?? raw?.convenienciaPct ?? 15)
    },
    observacoes: String(raw?.observacoes || '')
  };
}

export function calcularEventoUI(
  ev: EventoUI,
  fin: EventoFinUI,
  neg: NegociacaoUI,
  despesasEvento: Array<Record<string, unknown>>,
  advancedEvento: Array<Record<string, unknown>>,
  antecipacoesEvento: Array<Record<string, unknown>>,
  local: LocalData
) {
  let cap = 0;
  if (ev.capacidade.modo === 'manual') {
    cap = toNum(ev.capacidade.manual);
  } else if (ev.capacidade.modo === 'setores') {
    cap = local.setores
      .filter(s => ev.capacidade.setoresAbertos.includes(s.nome))
      .reduce((acc, s) => acc + toNum(s.capacidade), 0);
  } else {
    cap = toNum(local.capacidadeTotal || ev.capacidade.manual || 0);
  }

  const vendidos = toNum(ev.vendas.vendidos);
  const cortesias = toNum(ev.vendas.cortesias);
  const ingressosContados = vendidos + (ev.capacidade.contarCortesias ? cortesias : 0);
  const pctVendido = cap > 0 ? round2((ingressosContados / cap) * 100) : 0;

  const bil = round2(ev.bilheteria);
  const taxaAdm = fin.taxaAdm.ativo ? mulPct(bil, fin.taxaAdm.percentual) : 0;
  let taxaOp = 0;
  if (neg.taxaOp.tipo === 'porIngresso') {
    taxaOp = fromCents(Math.round(vendidos * toCents(neg.taxaOp.valor)));
  } else if (neg.taxaOp.tipo === 'percentual') {
    taxaOp = mulPct(bil, neg.taxaOp.valor);
  } else {
    taxaOp = round2(neg.taxaOp.valor);
  }

  const retencoesDetalhe = fin.retencoes.map(r => {
    const baseRet = r.base === 'liquido' ? addMoney(bil, -taxaAdm, -taxaOp) : bil;
    let valorCalculado = 0;
    if (r.tipo === 'percentual') valorCalculado = mulPct(baseRet, r.percentual);
    else if (r.tipo === 'fixo') valorCalculado = round2(r.valorFixo);
    else if (r.tipo === 'maiorEntre') valorCalculado = Math.max(round2(r.valorFixo), mulPct(baseRet, r.percentual));
    else if (r.tipo === 'porIngresso') valorCalculado = fromCents(Math.round(vendidos * toCents(r.valorUnitario)));
    else if (r.tipo === 'porCapacidade') valorCalculado = fromCents(Math.round(cap * toCents(r.valorUnitario)));

    valorCalculado = round2(valorCalculado);
    const descontaDoRepasse = r.ativo && r.responsavel === 'disk' && r.status === 'provisionado';
    return {
      ...r,
      valorCalculado,
      valor: descontaDoRepasse ? valorCalculado : 0,
      descontaDoRepasse
    };
  });

  const totRetencoes = fromCents(retencoesDetalhe.reduce((a, r) => a + toCents(r.valor), 0));

  const descontosDetalhe = fin.descontosOperacionais.map(d => {
    const valor = d.ativo ? fromCents(Math.round(toNum(d.quantidade) * toCents(d.valorUnitario))) : 0;
    return { ...d, valor };
  });
  const totOps = fromCents(descontosDetalhe.reduce((a, d) => a + toCents(d.valor), 0));

  const despesasPagas = fromCents(
    despesasEvento
      .filter(d => !d.status || d.status === 'Pago')
      .reduce((a, d) => a + toCents(d.valor), 0)
  );
  const despesasAPagar = fromCents(
    despesasEvento
      .filter(d => d.status === 'A pagar')
      .reduce((a, d) => a + toCents(d.valor), 0)
  );
  const abaterDespesasAPagar = fin.regra.abaterDespesasAPagar !== false;
  const despesas = addMoney(despesasPagas, abaterDespesasAPagar ? despesasAPagar : 0);

  const reserva = mulPct(bil, fin.regra.reservaReembolsoPct);
  const resultado = addMoney(bil, -taxaAdm, -taxaOp, -despesas, -totRetencoes, -totOps, -reserva);

  const rebateBruto = fin.rebate.ativo
    ? fin.rebate.tipo === 'percentual'
      ? mulPct(bil, fin.rebate.valor)
      : round2(fin.rebate.valor)
    : 0;
  const rebate = fromCents(Math.min(toCents(rebateBruto), toCents(taxaAdm)));

  const patrocinioBruto = fin.patrocinioEvento.ativo ? round2(fin.patrocinioEvento.valor) : 0;
  const patrocinio = fromCents(Math.min(toCents(patrocinioBruto), Math.max(0, toCents(taxaAdm) - toCents(rebate))));

  const excedente = subMoney(addMoney(rebateBruto, patrocinioBruto), addMoney(rebate, patrocinio));
  const taxaAdmLiquida = addMoney(taxaAdm, -rebate, -patrocinio);
  const creditos = addMoney(rebate, patrocinio);

  const creditosSujeitosTrava = Boolean(fin.regra.creditosSujeitosTrava);
  const basePositiva = Math.max(0, addMoney(resultado, creditosSujeitosTrava ? creditos : 0));
  const pctResultado = toNum(fin.regra.pctResultado);
  const A = mulPct(basePositiva, pctResultado);

  const faixasOrdenadas = [...fin.regra.faixas].sort((a, b) => a.gatilhoPct - b.gatilhoPct);
  let liberaPctB = 0;
  let faixaAtual: FaixaCapacidade | null = null;
  let proximaFaixaObj: FaixaCapacidade | null = null;
  for (const f of faixasOrdenadas) {
    if (pctVendido >= f.gatilhoPct) {
      liberaPctB = f.liberaPct;
      faixaAtual = f;
    } else if (!proximaFaixaObj) {
      proximaFaixaObj = f;
    }
  }
  const B = mulPct(basePositiva, liberaPctB);

  const modo = fin.regra.modo || 'MIN';
  let escolhido = modo === 'A' ? A : modo === 'B' ? B : Math.min(A, B);
  const teto = round2(fin.regra.teto);
  if (toCents(teto) > 0) escolhido = Math.min(escolhido, teto);
  escolhido = round2(escolhido);

  const liberadoRegra = addMoney(escolhido, creditosSujeitosTrava ? 0 : creditos);

  const advEv = fromCents(
    advancedEvento
      .filter(a => a.abaterNoProximo && (a.escopo === ev.id || a.escopo !== 'consolidado'))
      .reduce((acc, a) => acc + toCents(a.valor), 0)
  );
  const antEv = fromCents(
    antecipacoesEvento
      .filter(a => a.abaterNoProximo && (!a.status || a.status === 'Aprovada' || a.status === 'Paga'))
      .reduce((acc, a) => acc + toCents(a.valor) + toCents(mulPct(toNum(a.valor), toNum(a.taxaPct))), 0)
  );

  const jaRepassado = round2(ev.jaRepassado);
  const bruto = addMoney(liberadoRegra, -jaRepassado, -advEv, -antEv);
  const liberavel = Math.max(0, bruto);
  const saldoDevedor = Math.max(0, subMoney(0, bruto));
  const retido = Math.max(0, addMoney(Math.max(0, resultado), creditos, -liberadoRegra));

  const proximaFaixa = proximaFaixaObj
    ? {
        gatilhoPct: proximaFaixaObj.gatilhoPct,
        liberaPct: proximaFaixaObj.liberaPct,
        ingressosFaltantes: Math.max(0, Math.ceil((proximaFaixaObj.gatilhoPct / 100) * cap - ingressosContados))
      }
    : null;

  const dataLiberacaoTotal = somarDiasUteisBR(ev.data, fin.regra.liberaTotalDmais);

  return {
    capacidadeUsada: cap,
    vendidos,
    cortesias,
    ingressosContados,
    pctVendido,
    bil,
    taxaAdm,
    taxaOp,
    despesas,
    despesasPagas,
    despesasAPagar,
    abaterDespesasAPagar,
    totRetencoes,
    totOps,
    reserva,
    resultado,
    rebateBruto,
    rebate,
    patrocinioBruto,
    patrocinio,
    excedente,
    taxaAdmLiquida,
    creditos,
    creditosSujeitosTrava,
    basePositiva,
    pctResultado,
    liberaPctB,
    A,
    B,
    modo,
    teto,
    liberaTotalDmais: fin.regra.liberaTotalDmais,
    dataLiberacaoTotal,
    escolhido,
    liberadoRegra,
    jaRepassado,
    advEv,
    antEv,
    liberavel,
    saldoDevedor,
    retido,
    faixaAtual,
    faixas: faixasOrdenadas,
    proximaFaixa,
    retencoesDetalhe,
    descontosDetalhe
  };
}

export function simularVendasEventoUI(
  ev: EventoUI,
  fin: EventoFinUI,
  neg: NegociacaoUI,
  despesasEvento: Array<Record<string, unknown>>,
  advancedEvento: Array<Record<string, unknown>>,
  antecipacoesEvento: Array<Record<string, unknown>>,
  local: LocalData,
  vendidosSimulados: number,
  valorAlvoLiberavel: number
) {
  const atual = calcularEventoUI(ev, fin, neg, despesasEvento, advancedEvento, antecipacoesEvento, local);
  const cap = Math.max(1, atual.capacidadeUsada);
  const ticketMedio = atual.vendidos > 0 ? round2(atual.bil / atual.vendidos) : 60;
  const vendSim = Math.max(0, Math.min(cap, Math.round(vendidosSimulados)));
  const bilheteriaSimulada = round2(vendSim * ticketMedio);

  const evSim: EventoUI = {
    ...ev,
    vendas: { ...ev.vendas, vendidos: vendSim },
    bilheteria: bilheteriaSimulada
  };
  const simulacao = calcularEventoUI(evSim, fin, neg, despesasEvento, advancedEvento, antecipacoesEvento, local);

  type MetaSimulacao = {
    atingivel: boolean;
    vendidosNecessarios: number;
    ingressosFaltantes: number;
    pctCapacidadeNecessaria: number;
  };
  let meta: MetaSimulacao | null = null;

  if (valorAlvoLiberavel > 0) {
    let achou: MetaSimulacao | null = null;
    for (let ing = atual.vendidos; ing <= cap; ing++) {
      const cTeste = calcularEventoUI(
        {
          ...ev,
          vendas: { ...ev.vendas, vendidos: ing },
          bilheteria: round2(ing * ticketMedio)
        },
        fin,
        neg,
        despesasEvento,
        advancedEvento,
        antecipacoesEvento,
        local
      );
      if (cTeste.liberavel >= valorAlvoLiberavel - 0.009) {
        achou = {
          atingivel: true,
          vendidosNecessarios: ing,
          ingressosFaltantes: Math.max(0, ing - atual.vendidos),
          pctCapacidadeNecessaria: cTeste.pctVendido
        };
        break;
      }
    }
    meta = achou || {
      atingivel: false,
      vendidosNecessarios: cap,
      ingressosFaltantes: Math.max(0, cap - atual.vendidos),
      pctCapacidadeNecessaria: 100
    };
  }

  return {
    ticketMedio,
    vendidosSimulados: vendSim,
    ingressosAdicionais: vendSim - atual.vendidos,
    bilheteriaSimulada,
    simulacao,
    ganhoLiberavel: round2(simulacao.liberavel - atual.liberavel),
    meta
  };
}
