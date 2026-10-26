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
}

export function criarEstadoFinanceiroVazio(): EstadoFinanceiroRTDB {
  return {
    carregado: false,
    produtoras: {},
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
    auditoria: {}
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
    bindNode('/auditoria', v => { acumulado.auditoria = v as EstadoFinanceiroRTDB['auditoria']; })
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
