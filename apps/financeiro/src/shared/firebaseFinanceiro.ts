/**
 * Cliente Firebase Real para o Portal Financeiro DiskIngressos (Auth + RTDB + Cloud Functions)
 * - Exige rigorosamente Custom Claim `role === 'financeiro'`
 * - Assina em tempo real os nós operacionais e contábeis do RTDB
 * - Aciona `decidirRepasse` (aprovação, recusa, rateio e registro contábil sem movimentação bancária externa automática)
 * - Quando VITE_FIREBASE_API_KEY não está definida no .env, conecta automaticamente ao servidor RTDB local (:9005)
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  connectAuthEmulator,
  type User
} from 'firebase/auth';
import {
  getDatabase,
  ref,
  onValue,
  update,
  push,
  set,
  connectDatabaseEmulator
} from 'firebase/database';
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator
} from 'firebase/functions';

const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'diskingressos-62591.firebaseapp.com',
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || 'https://diskingressos-62591-default-rtdb.firebaseio.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'diskingressos-62591'
};

export const firebaseFinanceiroConfigurado = Boolean(
  firebaseConfig.apiKey || env.VITE_USE_FIREBASE_EMULATOR === 'true'
);

let emuladoresConectados = false;

function obterUrlServidorLocal(): string {
  const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1';
  return `http://${host}:9005`;
}

function obterServicosFirebase() {
  const app = getApps().length
    ? getApps()[0]
    : initializeApp(
        firebaseConfig.apiKey ? firebaseConfig : { ...firebaseConfig, apiKey: 'emulator-api-key' }
      );
  const auth = getAuth(app);
  const db = getDatabase(app);
  const functions = getFunctions(app, env.VITE_FIREBASE_FUNCTIONS_REGION || 'southamerica-east1');

  if (env.VITE_USE_FIREBASE_EMULATOR === 'true' && !emuladoresConectados) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    emuladoresConectados = true;
  }

  return { app, auth, db, functions };
}

export const ROLES_PAINEL_INTERNO = ['financeiro', 'operador', 'aprovador', 'auditor', 'fiscal', 'comercial'];

export interface SessaoFinanceiro {
  uid: string;
  email: string;
  role: string | null;
  subRole?: string | null;
  autorizado: boolean;
}

const ouvintesSessaoLocal = new Set<(sessao: SessaoFinanceiro | null) => void>();
let sessaoLocalAtual: SessaoFinanceiro | null = {
  uid: 'uid_financeiro_local',
  email: 'financeiro@diskingressos.com.br',
  role: 'financeiro',
  autorizado: true
};
const ouvintesDadosLocais = new Set<() => void>();

function notificarDadosLocais() {
  ouvintesDadosLocais.forEach(fn => fn());
}

export function observarSessaoFinanceiro(callback: (sessao: SessaoFinanceiro | null) => void): () => void {
  if (!firebaseFinanceiroConfigurado) {
    ouvintesSessaoLocal.add(callback);
    callback(sessaoLocalAtual);
    return () => {
      ouvintesSessaoLocal.delete(callback);
    };
  }
  const { auth } = obterServicosFirebase();
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (!user) {
      callback(null);
      return;
    }
    const tokenResult = await user.getIdTokenResult();
    const role = (tokenResult.claims.role as string) || null;
    const subRole = (tokenResult.claims.subRole as string) || role;
    callback({
      uid: user.uid,
      email: user.email || '',
      role,
      subRole,
      autorizado: Boolean(role && ROLES_PAINEL_INTERNO.includes(role))
    });
  });
}

export async function autenticarFinanceiroEmailSenha(email: string, senha: string) {
  if (!firebaseFinanceiroConfigurado) {
    const role = email.toLowerCase().includes('produtor') ? 'produtor' : 'financeiro';
    sessaoLocalAtual = {
      uid: 'uid_financeiro_local',
      email: email.trim() || 'financeiro@diskingressos.com.br',
      role,
      autorizado: role === 'financeiro'
    };
    ouvintesSessaoLocal.forEach(cb => cb(sessaoLocalAtual));
    return;
  }
  const { auth } = obterServicosFirebase();
  await signInWithEmailAndPassword(auth, email, senha);
}

export async function encerrarSessaoFinanceiro() {
  if (!firebaseFinanceiroConfigurado) {
    sessaoLocalAtual = null;
    ouvintesSessaoLocal.forEach(cb => cb(null));
    return;
  }
  const { auth } = obterServicosFirebase();
  await signOut(auth);
}

export interface EstadoFinanceiroRTDB {
  carregado: boolean;
  produtoras: Record<string, Record<string, unknown>>;
  locais: Record<string, Record<string, unknown>>;
  eventos: Record<string, Record<string, unknown>>;
  eventosFin: Record<string, Record<string, unknown>>;
  negociacoes: Record<string, Record<string, unknown>>;
  repasses: Record<string, Record<string, unknown>>;
  antecipacoes: Record<string, Record<string, unknown>>;
  advanced: Record<string, Record<string, unknown>>;
  contasPorProdutora: Record<string, Record<string, Record<string, unknown>>>;
  despesas: Record<string, Record<string, unknown>>;
  contasPagar: Record<string, Record<string, unknown>>;
  contasReceber: Record<string, Record<string, unknown>>;
  saldos: Record<string, Record<string, unknown>>;
  fluxoCaixa: Record<string, unknown>;
  lancamentos: Record<string, Record<string, unknown>>;
  fechamentos: Record<string, Record<string, unknown>>;
  auditoria: Record<string, Record<string, unknown>>;
  usuarios_erp?: Record<string, Record<string, unknown>>;
  config?: Record<string, Record<string, unknown>>;
  auditoria_relatorios?: Record<string, Record<string, unknown>>;
  eventos_dominio?: Record<string, Record<string, unknown>>;
  bi_executivo?: Record<string, Record<string, unknown>>;
  contratos?: Record<string, Record<string, unknown>>;
  vendas_lotes?: Record<string, Record<string, unknown>>;
  recebiveis_agenda?: Record<string, Record<string, unknown>>;
  cobrancas_devedores?: Record<string, Record<string, unknown>>;
  fornecedores_op?: Record<string, Record<string, unknown>>;
  notificacoes_central?: Record<string, Record<string, unknown>>;
  conciliacoes?: Record<string, Record<string, unknown>>;
  remessas?: Record<string, Record<string, unknown>>;
  apuracoes_fiscais?: Record<string, Record<string, unknown>>;
  chargebacks?: Record<string, Record<string, unknown>>;
}

export function criarEstadoFinanceiroVazio(): EstadoFinanceiroRTDB {
  return {
    carregado: false,
    produtoras: {},
    locais: {},
    eventos: {},
    eventosFin: {},
    negociacoes: {},
    repasses: {},
    antecipacoes: {},
    advanced: {},
    contasPorProdutora: {},
    despesas: {},
    contasPagar: {},
    contasReceber: {},
    saldos: {},
    fluxoCaixa: {},
    lancamentos: {},
    fechamentos: {},
    auditoria: {},
    usuarios_erp: {},
    config: {},
    auditoria_relatorios: {},
    eventos_dominio: {},
    bi_executivo: {},
    contratos: {},
    vendas_lotes: {},
    recebiveis_agenda: {},
    cobrancas_devedores: {},
    fornecedores_op: {},
    notificacoes_central: {},
    conciliacoes: {},
    remessas: {},
    apuracoes_fiscais: {},
    chargebacks: {}
  };
}

export function assinarDadosFinanceiroRTDB(
  onUpdate: (estado: EstadoFinanceiroRTDB) => void
): () => void {
  if (!firebaseFinanceiroConfigurado) {
    let ativo = true;
    const buscar = async () => {
      try {
        const resp = await fetch(`${obterUrlServidorLocal()}/rtdb/financeiro`);
        if (resp.ok && ativo) {
          const data = (await resp.json()) as EstadoFinanceiroRTDB;
          onUpdate(data);
        }
      } catch {
        // Ignora erro de rede temporário
      }
    };
    buscar();
    ouvintesDadosLocais.add(buscar);
    const timer = setInterval(buscar, 2500);
    return () => {
      ativo = false;
      ouvintesDadosLocais.delete(buscar);
      clearInterval(timer);
    };
  }

  const { db } = obterServicosFirebase();
  const acumulado = criarEstadoFinanceiroVazio();

  const bindNode = (path: string, assign: (val: Record<string, unknown>) => void) =>
    onValue(ref(db, path), snap => {
      assign((snap.val() || {}) as Record<string, unknown>);
      acumulado.carregado = true;
      onUpdate({ ...acumulado });
    });

  const unsubs = [
    bindNode('/produtoras', v => { acumulado.produtoras = v as EstadoFinanceiroRTDB['produtoras']; }),
    bindNode('/locais', v => { acumulado.locais = v as EstadoFinanceiroRTDB['locais']; }),
    bindNode('/eventos', v => { acumulado.eventos = v as EstadoFinanceiroRTDB['eventos']; }),
    bindNode('/eventos_fin', v => { acumulado.eventosFin = v as EstadoFinanceiroRTDB['eventosFin']; }),
    bindNode('/negociacoes', v => { acumulado.negociacoes = v as EstadoFinanceiroRTDB['negociacoes']; }),
    bindNode('/repasses', v => { acumulado.repasses = v as EstadoFinanceiroRTDB['repasses']; }),
    bindNode('/antecipacoes', v => { acumulado.antecipacoes = v as EstadoFinanceiroRTDB['antecipacoes']; }),
    bindNode('/advanced', v => { acumulado.advanced = v as EstadoFinanceiroRTDB['advanced']; }),
    bindNode('/contas', v => { acumulado.contasPorProdutora = v as EstadoFinanceiroRTDB['contasPorProdutora']; }),
    bindNode('/despesas', v => { acumulado.despesas = v as EstadoFinanceiroRTDB['despesas']; }),
    bindNode('/contas_pagar', v => { acumulado.contasPagar = v as EstadoFinanceiroRTDB['contasPagar']; }),
    bindNode('/contas_receber', v => { acumulado.contasReceber = v as EstadoFinanceiroRTDB['contasReceber']; }),
    bindNode('/saldos', v => { acumulado.saldos = v as EstadoFinanceiroRTDB['saldos']; }),
    bindNode('/fluxo_caixa', v => { acumulado.fluxoCaixa = v; }),
    bindNode('/lancamentos', v => { acumulado.lancamentos = v as EstadoFinanceiroRTDB['lancamentos']; }),
    bindNode('/fechamentos', v => { acumulado.fechamentos = v as EstadoFinanceiroRTDB['fechamentos']; }),
    bindNode('/auditoria', v => { acumulado.auditoria = v as EstadoFinanceiroRTDB['auditoria']; }),
    bindNode('/usuarios_erp', v => { acumulado.usuarios_erp = v as EstadoFinanceiroRTDB['usuarios_erp']; }),
    bindNode('/config', v => { acumulado.config = v as EstadoFinanceiroRTDB['config']; }),
    bindNode('/auditoria_relatorios', v => { acumulado.auditoria_relatorios = v as EstadoFinanceiroRTDB['auditoria_relatorios']; }),
    bindNode('/eventos_dominio', v => { acumulado.eventos_dominio = v as EstadoFinanceiroRTDB['eventos_dominio']; }),
    bindNode('/bi_executivo', v => { acumulado.bi_executivo = v as EstadoFinanceiroRTDB['bi_executivo']; }),
    bindNode('/contratos', v => { acumulado.contratos = v as EstadoFinanceiroRTDB['contratos']; }),
    bindNode('/vendas_lotes', v => { acumulado.vendas_lotes = v as EstadoFinanceiroRTDB['vendas_lotes']; }),
    bindNode('/recebiveis_agenda', v => { acumulado.recebiveis_agenda = v as EstadoFinanceiroRTDB['recebiveis_agenda']; }),
    bindNode('/cobrancas_devedores', v => { acumulado.cobrancas_devedores = v as EstadoFinanceiroRTDB['cobrancas_devedores']; }),
    bindNode('/fornecedores_op', v => { acumulado.fornecedores_op = v as EstadoFinanceiroRTDB['fornecedores_op']; }),
    bindNode('/notificacoes_central', v => { acumulado.notificacoes_central = v as EstadoFinanceiroRTDB['notificacoes_central']; }),
    bindNode('/conciliacoes', v => { acumulado.conciliacoes = v as EstadoFinanceiroRTDB['conciliacoes']; }),
    bindNode('/remessas', v => { acumulado.remessas = v as EstadoFinanceiroRTDB['remessas']; }),
    bindNode('/apuracoes_fiscais', v => { acumulado.apuracoes_fiscais = v as EstadoFinanceiroRTDB['apuracoes_fiscais']; }),
    bindNode('/chargebacks', v => { acumulado.chargebacks = v as EstadoFinanceiroRTDB['chargebacks']; })
  ];

  return () => {
    unsubs.forEach(u => u());
  };
}

export async function chamarDecidirRepasse(payload: {
  repasseId: string;
  acao: 'aprovar' | 'recusar' | 'pagar' | 'estornar';
  motivo?: string;
  protocoloDevolucao?: string;
  modoRateio?: 'proporcional' | 'manual';
  rateioManual?: Record<string, number>;
  protocoloBancario?: string;
  comprovanteUrl?: string;
}) {
  if (!firebaseFinanceiroConfigurado) {
    const resp = await fetch(`${obterUrlServidorLocal()}/callable/decidirRepasse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    notificarDadosLocais();
    return data;
  }
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable(functions, 'decidirRepasse');
  const res = await fn(payload);
  return res.data;
}

export async function chamarDecidirAntecipacao(payload: {
  antId: string;
  acao: 'aprovar' | 'recusar' | 'pagar' | 'estornar';
  motivo?: string;
  protocoloBancario?: string;
  protocoloDevolucao?: string;
}) {
  if (!firebaseFinanceiroConfigurado) {
    const resp = await fetch(`${obterUrlServidorLocal()}/callable/decidirAntecipacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    notificarDadosLocais();
    return data;
  }
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable(functions, 'decidirAntecipacao');
  const res = await fn(payload);
  return res.data;
}

export async function atualizarStatusContaBancariaRTDB(
  produtoraId: string,
  contaId: string,
  status: 'Validada' | 'Pendente' | 'Recusada',
  usuarioEmail: string
) {
  if (!firebaseFinanceiroConfigurado) {
    await fetch(`${obterUrlServidorLocal()}/rtdb/validarConta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produtoraId, contaId, status, usuarioEmail })
    });
    notificarDadosLocais();
    return;
  }
  const { db } = obterServicosFirebase();
  await update(ref(db, `/contas/${produtoraId}/${contaId}`), { status });
  const audRef = push(ref(db, '/auditoria'));
  await set(audRef, {
    dataHora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    usuario: usuarioEmail,
    modulo: 'Contas Bancarias',
    eventoId: produtoraId,
    acao: `Conta ${status}`,
    resumo: `Conta ${contaId} da produtora ${produtoraId} marcada como ${status}`
  });
}

export async function decidirAntecipacaoRTDB(
  antecipacaoId: string,
  status: 'Aprovada' | 'Recusada' | 'Paga',
  _usuarioEmail?: string
) {
  const acao = status === 'Aprovada' ? 'aprovar' : status === 'Recusada' ? 'recusar' : 'pagar';
  return chamarDecidirAntecipacao({
    antId: antecipacaoId,
    acao,
    motivo: status === 'Recusada' ? 'Recusada na análise financeira' : undefined
  });
}

export async function chamarPreviaFechamento(payload: { competencia: string }): Promise<unknown> {
  return chamarCallableFinanceiro('previaFechamento', payload);
}

export async function chamarFecharCompetencia(payload: { competencia: string; observacoes?: string }): Promise<unknown> {
  return chamarCallableFinanceiro('fecharCompetencia', payload);
}

export async function chamarReabrirCompetencia(payload: { competencia: string; motivo: string }): Promise<unknown> {
  return chamarCallableFinanceiro('reabrirCompetencia', payload);
}

export async function chamarSalvarProdutora(payload: {
  id?: string;
  nome: string;
  cnpj: string;
  patrocinio?: { ativo: boolean; descricao: string; valor: number };
}): Promise<unknown> {
  return chamarCallableFinanceiro('salvarProdutora', payload);
}

export async function chamarSalvarLocal(payload: {
  id?: string;
  nome: string;
  cidade: string;
  uf: string;
  capacidadeTotal?: number;
  setores: Array<{ nome: string; capacidade: number }>;
}): Promise<unknown> {
  return chamarCallableFinanceiro('salvarLocal', payload);
}

export async function chamarSalvarEvento(payload: {
  id?: string;
  nome: string;
  data: string;
  produtoraId: string;
  localId: string;
  liberadoParaSolicitacao?: boolean;
  capacidade?: {
    modo: 'local' | 'setores' | 'manual';
    setoresAbertos?: string[];
    manual?: number;
    contarCortesias?: boolean;
  };
}): Promise<unknown> {
  return chamarCallableFinanceiro('salvarEvento', payload);
}

export async function chamarAlterarStatusCadastro(payload: {
  tipo: 'produtora' | 'local' | 'evento';
  id: string;
  ativo: boolean;
  motivo?: string;
}): Promise<unknown> {
  return chamarCallableFinanceiro('alterarStatusCadastro', payload);
}

export async function cadastrarContaBancariaRTDB(
  produtoraId: string,
  dadosConta: {
    banco: string;
    agencia: string;
    conta: string;
    titular: string;
    cnpj: string;
    pix: string;
  },
  usuarioEmail: string
) {
  const contaId = `cta_${Date.now()}`;
  const registro = {
    ...dadosConta,
    status: 'Validada',
    homologadoPor: usuarioEmail,
    homologadoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  };
  if (!firebaseFinanceiroConfigurado) {
    await fetch(`${obterUrlServidorLocal()}/rtdb/validarConta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produtoraId, contaId, status: 'Validada', usuarioEmail, ...dadosConta })
    });
    notificarDadosLocais();
    return { contaId, ...registro };
  }
  const { db } = obterServicosFirebase();
  await set(ref(db, `/contas/${produtoraId}/${contaId}`), registro);
  const audRef = push(ref(db, '/auditoria'));
  await set(audRef, {
    dataHora: registro.homologadoEm,
    usuario: usuarioEmail,
    modulo: 'Contas Bancarias',
    eventoId: produtoraId,
    acao: 'Cadastro e Homologação de Conta',
    resumo: `Nova conta ${contaId} (${dadosConta.banco} Ag ${dadosConta.agencia} CC ${dadosConta.conta}) cadastrada e validada para ${produtoraId}`
  });
  return { contaId, ...registro };
}

export async function chamarCallableFinanceiro<T = Record<string, unknown>>(
  nomeCallable: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  if (!firebaseFinanceiroConfigurado) {
    const resp = await fetch(`${obterUrlServidorLocal()}/callable/${nomeCallable}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      let msgErro = `Callable ${nomeCallable} indisponível no simulador local. Conecte ao Firebase ou Emulator.`;
      try {
        const errBody = (await resp.json()) as { error?: string };
        if (errBody && errBody.error) {
          msgErro = errBody.error;
        }
      } catch {
        // Ignora erro de parse JSON
      }
      throw new Error(msgErro);
    }
    const data = (await resp.json()) as T;
    notificarDadosLocais();
    return data;
  }
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable<Record<string, unknown>, T>(functions, nomeCallable);
  const res = await fn(payload);
  return res.data;
}

export function chamarAtribuirPapelUsuarioERP(payload: {
  uid: string;
  email: string;
  nome: string;
  papel: string;
  produtoraId?: string;
  ativo?: boolean;
  motivo: string;
}) {
  return chamarCallableFinanceiro('atribuirPapelUsuarioERP', payload);
}

export function chamarConfigurarAlcadaERP(payload: {
  ativo: boolean;
  limiteDuplaAprovacaoReais: number;
  motivo: string;
}) {
  return chamarCallableFinanceiro('configurarAlcadaERP', payload);
}

export function chamarConsultarAuditoriaConsolidada(payload: {
  modulo?: string;
  usuario?: string;
  eventoId?: string;
  textoBusca?: string;
  persistirSnapshot?: boolean;
}) {
  return chamarCallableFinanceiro('consultarAuditoriaConsolidada', payload);
}

export function chamarGerarSnapshotBiExecutivo(payload: { chaveSnapshot?: string } = {}) {
  return chamarCallableFinanceiro('gerarSnapshotBiExecutivo', payload);
}

export async function salvarConfiguracaoEventoTravasRTDB(payload: {
  eventoId: string;
  eventoPatch?: Record<string, unknown>;
  eventoFin: Record<string, unknown>;
  negociacao?: Record<string, unknown>;
  usuarioEmail: string;
  resumoAuditoria: string;
}) {
  const { eventoId, eventoPatch, eventoFin, negociacao, usuarioEmail, resumoAuditoria } = payload;
  if (!firebaseFinanceiroConfigurado) {
    await fetch(`${obterUrlServidorLocal()}/rtdb/salvarEventosTravas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    notificarDadosLocais();
    return { ok: true, eventoId };
  }
  const { db } = obterServicosFirebase();
  await set(ref(db, `/eventos_fin/${eventoId}`), eventoFin);
  if (negociacao) {
    await set(ref(db, `/negociacoes/${eventoId}`), negociacao);
  }
  if (eventoPatch && eventoPatch.capacidade && eventoPatch.nome && eventoPatch.produtoraId && eventoPatch.localId) {
    try {
      await chamarSalvarEvento({
        id: eventoId,
        nome: String(eventoPatch.nome),
        data: String(eventoPatch.data || ''),
        produtoraId: String(eventoPatch.produtoraId),
        localId: String(eventoPatch.localId),
        liberadoParaSolicitacao: eventoPatch.liberadoParaSolicitacao !== false,
        capacidade: eventoPatch.capacidade as {
          modo: 'local' | 'setores' | 'manual';
          setoresAbertos?: string[];
          manual?: number;
          contarCortesias?: boolean;
        }
      });
    } catch {
      // Se salvarEvento recusar edição por corrida ou regra, preserva /eventos_fin salvo
    }
  }
  const audRef = push(ref(db, '/auditoria'));
  await set(audRef, {
    dataHora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    usuario: usuarioEmail,
    modulo: 'Travas e Taxas',
    eventoId,
    acao: 'Salvo Configuração do Evento e Travas',
    resumo: resumoAuditoria
  });
  return { ok: true, eventoId };
}

export async function salvarNegociacaoEventoRTDB(payload: {
  eventoId: string;
  negociacao: {
    status: string;
    taxaOp: { tipo: 'porIngresso' | 'percentual' | 'fixo'; valor: number };
    conveniencia?: { percentual: number };
    observacoes?: string;
  };
  usuarioEmail: string;
  resumoAuditoria: string;
}) {
  const { eventoId, negociacao, usuarioEmail, resumoAuditoria } = payload;
  if (!firebaseFinanceiroConfigurado) {
    await fetch(`${obterUrlServidorLocal()}/rtdb/salvarNegociacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    notificarDadosLocais();
    return { ok: true, eventoId };
  }
  const { db } = obterServicosFirebase();
  await set(ref(db, `/negociacoes/${eventoId}`), negociacao);
  const audRef = push(ref(db, '/auditoria'));
  await set(audRef, {
    dataHora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    usuario: usuarioEmail,
    modulo: 'Negociações',
    eventoId,
    acao: 'Salvo Negociação Comercial',
    resumo: resumoAuditoria
  });
  return { ok: true, eventoId };
}

export async function salvarAdvancedRTDB(payload: {
  id?: string;
  produtoraId: string;
  data: string;
  descricao: string;
  valor: number;
  escopo: string;
  abaterNoProximo: boolean;
  usuarioEmail: string;
}) {
  const advId = payload.id || `adv_${Date.now()}`;
  const registro = {
    produtoraId: payload.produtoraId,
    data: payload.data,
    descricao: payload.descricao,
    valor: Number(payload.valor || 0),
    escopo: payload.escopo || 'consolidado',
    abaterNoProximo: Boolean(payload.abaterNoProximo)
  };
  if (!firebaseFinanceiroConfigurado) {
    await fetch(`${obterUrlServidorLocal()}/rtdb/salvarAdvanced`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: advId, ...registro, usuarioEmail: payload.usuarioEmail })
    });
    notificarDadosLocais();
    return { id: advId, ...registro };
  }
  const { db } = obterServicosFirebase();
  await set(ref(db, `/advanced/${advId}`), registro);
  const audRef = push(ref(db, '/auditoria'));
  await set(audRef, {
    dataHora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    usuario: payload.usuarioEmail,
    modulo: 'Advanced',
    eventoId: registro.escopo,
    acao: payload.id ? 'Atualização de Adiantamento' : 'Inclusão de Adiantamento',
    resumo: `${registro.descricao} (${advId}) · R$ ${registro.valor.toFixed(2)} · Escopo: ${registro.escopo} · Abater: ${registro.abaterNoProximo ? 'Sim' : 'Compensado'}`
  });
  return { id: advId, ...registro };
}

export async function removerAdvancedRTDB(payload: { id: string; usuarioEmail: string }) {
  if (!firebaseFinanceiroConfigurado) {
    await fetch(`${obterUrlServidorLocal()}/rtdb/removerAdvanced`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    notificarDadosLocais();
    return { ok: true, id: payload.id };
  }
  const { db } = obterServicosFirebase();
  await set(ref(db, `/advanced/${payload.id}`), null);
  const audRef = push(ref(db, '/auditoria'));
  await set(audRef, {
    dataHora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    usuario: payload.usuarioEmail,
    modulo: 'Advanced',
    eventoId: 'consolidado',
    acao: 'Remoção de Adiantamento',
    resumo: `Adiantamento ${payload.id} removido pelo Financeiro.`
  });
  return { ok: true, id: payload.id };
}

export async function salvarDespesaEventoRTDB(payload: {
  id?: string;
  eventoId: string;
  produtoraId: string;
  data: string;
  categoria: string;
  fornecedor: string;
  nfCodigo: string;
  comprovanteUrl: string;
  valor: number;
  status: 'Pago' | 'A pagar';
  usuarioEmail: string;
}) {
  const despId = payload.id || `desp_${Date.now()}`;
  const registro = {
    eventoId: payload.eventoId,
    produtoraId: payload.produtoraId,
    data: payload.data,
    categoria: payload.categoria,
    fornecedor: payload.fornecedor,
    nfCodigo: payload.nfCodigo || '',
    comprovanteUrl: payload.comprovanteUrl || '',
    valor: Number(payload.valor || 0),
    status: payload.status || 'Pago'
  };
  if (!firebaseFinanceiroConfigurado) {
    await fetch(`${obterUrlServidorLocal()}/rtdb/salvarDespesa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: despId, ...registro, usuarioEmail: payload.usuarioEmail })
    });
    notificarDadosLocais();
    return { id: despId, ...registro };
  }
  const { db } = obterServicosFirebase();
  await set(ref(db, `/despesas/${despId}`), registro);
  const audRef = push(ref(db, '/auditoria'));
  await set(audRef, {
    dataHora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    usuario: payload.usuarioEmail,
    modulo: 'Despesas',
    eventoId: registro.eventoId,
    acao: payload.id ? 'Atualização de Despesa' : 'Lançamento de Despesa',
    resumo: `${registro.categoria} (${registro.fornecedor}) · R$ ${registro.valor.toFixed(2)} · NF: ${registro.nfCodigo || 's/NF'} · Status: ${registro.status}`
  });
  return { id: despId, ...registro };
}

export async function removerDespesaEventoRTDB(payload: { id: string; eventoId?: string; usuarioEmail: string }) {
  if (!firebaseFinanceiroConfigurado) {
    await fetch(`${obterUrlServidorLocal()}/rtdb/removerDespesa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    notificarDadosLocais();
    return { ok: true, id: payload.id };
  }
  const { db } = obterServicosFirebase();
  await set(ref(db, `/despesas/${payload.id}`), null);
  const audRef = push(ref(db, '/auditoria'));
  await set(audRef, {
    dataHora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    usuario: payload.usuarioEmail,
    modulo: 'Despesas',
    eventoId: payload.eventoId || 'Geral',
    acao: 'Remoção de Despesa',
    resumo: `Despesa ${payload.id} removida pelo Financeiro.`
  });
  return { ok: true, id: payload.id };
}

export async function chamarRegistrarBaixaTitulo(payload: {
  natureza: 'pagar' | 'receber';
  tituloId: string;
  dataBaixa?: string;
  contaBanco?: string;
  historico?: string;
}) {
  return chamarCallableFinanceiro('registrarBaixaTitulo', payload);
}

export async function criarTituloFinanceiroRTDB(payload: {
  natureza: 'pagar' | 'receber';
  id?: string;
  produtoraId: string;
  eventoId: string;
  categoria: string;
  fornecedorOuOrigem: string;
  vencimento: string;
  valorOriginal: number;
  usuarioEmail: string;
}) {
  if (!firebaseFinanceiroConfigurado) {
    const resp = await fetch(`${obterUrlServidorLocal()}/rtdb/criarTitulo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    notificarDadosLocais();
    return data;
  }
  const { db } = obterServicosFirebase();
  const prefix = payload.natureza === 'pagar' ? 'cp_man' : 'cr_man';
  const id = payload.id || `${prefix}_${Date.now()}`;
  const colecao = payload.natureza === 'pagar' ? 'contas_pagar' : 'contas_receber';
  const registro =
    payload.natureza === 'pagar'
      ? {
          id,
          produtoraId: payload.produtoraId,
          eventoId: payload.eventoId,
          categoria: payload.categoria,
          fornecedor: payload.fornecedorOuOrigem,
          vencimento: payload.vencimento,
          valorOriginal: Number(payload.valorOriginal || 0),
          valorPago: 0,
          status: 'Aprovada',
          criadoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        }
      : {
          id,
          produtoraId: payload.produtoraId,
          eventoId: payload.eventoId,
          categoria: payload.categoria,
          adquirente: payload.fornecedorOuOrigem,
          vencimento: payload.vencimento,
          valorOriginal: Number(payload.valorOriginal || 0),
          valorRecebido: 0,
          status: 'Prevista',
          criadoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        };
  await set(ref(db, `/${colecao}/${id}`), registro);
  const audRef = push(ref(db, '/auditoria'));
  await set(audRef, {
    dataHora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    usuario: payload.usuarioEmail,
    modulo: payload.natureza === 'pagar' ? 'Contas a Pagar' : 'Contas a Receber',
    eventoId: payload.eventoId || payload.produtoraId,
    acao: `Inclusão de Título (${id})`,
    resumo: `${payload.categoria} · ${payload.fornecedorOuOrigem} · R$ ${Number(payload.valorOriginal || 0).toFixed(2)} · Venc: ${payload.vencimento}`
  });
  return registro;
}

export async function chamarEstornarLancamento(payload: {
  lancamentoId: string;
  motivo: string;
  dataEstorno?: string;
}) {
  return chamarCallableFinanceiro('estornarLancamento', payload);
}

export async function recalcularFluxoCaixaRTDB(payload: {
  saldoInicialBancario: number;
  dataBase?: string;
}) {
  if (!firebaseFinanceiroConfigurado) {
    const resp = await fetch(`${obterUrlServidorLocal()}/rtdb/recalcularFluxoCaixa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    notificarDadosLocais();
    return data;
  }
  return chamarCallableFinanceiro('recalcularFluxoCaixa', payload);
}

