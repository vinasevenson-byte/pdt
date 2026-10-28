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

export async function chamarPreviaFechamento(payload: { competencia: string }) {
  if (!firebaseFinanceiroConfigurado) {
    throw new Error(
      'O simulador local não implementa previaFechamento. Conecte ao Firebase ou Emulator para consultar a prévia oficial do servidor.'
    );
  }
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable(functions, 'previaFechamento');
  const res = await fn(payload);
  return res.data;
}

export async function chamarFecharCompetencia(payload: { competencia: string; observacoes?: string }) {
  if (!firebaseFinanceiroConfigurado) {
    throw new Error(
      'O simulador local não implementa fecharCompetencia. Conecte ao Firebase ou Emulator para selar e fechar a competência.'
    );
  }
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable(functions, 'fecharCompetencia');
  const res = await fn(payload);
  return res.data;
}

export async function chamarReabrirCompetencia(payload: { competencia: string; motivo: string }) {
  if (!firebaseFinanceiroConfigurado) {
    throw new Error(
      'O simulador local não implementa reabrirCompetencia. Conecte ao Firebase ou Emulator para reabrir a competência.'
    );
  }
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable(functions, 'reabrirCompetencia');
  const res = await fn(payload);
  return res.data;
}

export async function chamarSalvarProdutora(payload: {
  id?: string;
  nome: string;
  cnpj: string;
  patrocinio?: { ativo: boolean; descricao: string; valor: number };
}) {
  if (!firebaseFinanceiroConfigurado) {
    throw new Error('O simulador local não implementa salvarProdutora. Conecte ao Firebase ou Emulator.');
  }
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable(functions, 'salvarProdutora');
  const res = await fn(payload);
  return res.data;
}

export async function chamarSalvarLocal(payload: {
  id?: string;
  nome: string;
  cidade: string;
  uf: string;
  capacidadeTotal?: number;
  setores: Array<{ nome: string; capacidade: number }>;
}) {
  if (!firebaseFinanceiroConfigurado) {
    throw new Error('O simulador local não implementa salvarLocal. Conecte ao Firebase ou Emulator.');
  }
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable(functions, 'salvarLocal');
  const res = await fn(payload);
  return res.data;
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
}) {
  if (!firebaseFinanceiroConfigurado) {
    throw new Error('O simulador local não implementa salvarEvento. Conecte ao Firebase ou Emulator.');
  }
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable(functions, 'salvarEvento');
  const res = await fn(payload);
  return res.data;
}

export async function chamarAlterarStatusCadastro(payload: {
  tipo: 'produtora' | 'local' | 'evento';
  id: string;
  ativo: boolean;
  motivo?: string;
}) {
  if (!firebaseFinanceiroConfigurado) {
    throw new Error('O simulador local não implementa alterarStatusCadastro. Conecte ao Firebase ou Emulator.');
  }
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable(functions, 'alterarStatusCadastro');
  const res = await fn(payload);
  return res.data;
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
      throw new Error(`Callable ${nomeCallable} indisponível no simulador local. Conecte ao Firebase ou Emulator.`);
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
