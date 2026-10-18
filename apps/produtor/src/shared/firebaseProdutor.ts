/**
 * Cliente Firebase Real para o Portal do Produtor (Auth + RTDB + Cloud Functions)
 * - Valida rigorosamente Custom Claims (`role === 'produtor'` e `produtoraId`)
 * - Lê exclusivamente os nós autorizados no RTDB para a produtora autenticada
 * - Aciona os callables reais `solicitarRepasse` e `solicitarAntecipacao`
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
  query,
  orderByChild,
  equalTo,
  push,
  set,
  connectDatabaseEmulator
} from 'firebase/database';
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator
} from 'firebase/functions';
import {
  criarEstadoProdutorVazio,
  type EstadoProdutorRTDB,
  type BorderoEventoLimpo,
  type ContaBancariaProdutor,
  type RepasseHistoricoProdutor,
  type AntecipacaoProdutor,
  type DespesaEventoProdutor
} from './dadosProdutor';

const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'diskingressos-62591.firebaseapp.com',
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || 'https://diskingressos-62591-default-rtdb.firebaseio.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'diskingressos-62591'
};

export const firebaseConfigurado = Boolean(firebaseConfig.apiKey || env.VITE_USE_FIREBASE_EMULATOR === 'true');

let emuladoresConectados = false;

function obterServicosFirebase() {
  const app = getApps().length ? getApps()[0] : initializeApp(
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

export interface SessaoProdutor {
  uid: string;
  email: string;
  role: string | null;
  produtoraId: string | null;
  autorizado: boolean;
}

export function observarSessaoProdutor(callback: (sessao: SessaoProdutor | null) => void): () => void {
  if (!firebaseConfigurado) {
    callback(null);
    return () => {};
  }
  const { auth } = obterServicosFirebase();
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (!user) {
      callback(null);
      return;
    }
    const tokenResult = await user.getIdTokenResult();
    const role = (tokenResult.claims.role as string) || null;
    const produtoraId = (tokenResult.claims.produtoraId as string) || null;
    callback({
      uid: user.uid,
      email: user.email || '',
      role,
      produtoraId,
      autorizado: role === 'produtor' && Boolean(produtoraId)
    });
  });
}

export async function autenticarProdutorEmailSenha(email: string, senha: string) {
  const { auth } = obterServicosFirebase();
  await signInWithEmailAndPassword(auth, email, senha);
}

export async function encerrarSessaoProdutor() {
  const { auth } = obterServicosFirebase();
  await signOut(auth);
}

/**
 * Inscreve em tempo real nos nós permitidos pelas regras de segurança do RTDB para a produtora autenticada.
 */
export function assinarDadosProdutorRTDB(
  produtoraId: string,
  onUpdate: (estado: EstadoProdutorRTDB) => void
): () => void {
  const { db } = obterServicosFirebase();
  const acumulado: EstadoProdutorRTDB = criarEstadoProdutorVazio(produtoraId);

  let metaEventos: Record<string, { nome?: string; data?: string; localId?: string; liberadoParaSolicitacao?: boolean }> = {};
  let locaisMap: Record<string, { nome?: string; cidade?: string; uf?: string }> = {};
  let borderosMap: Record<string, unknown> = {};

  function recomporEventos() {
    const lista: BorderoEventoLimpo[] = [];
    for (const [evId, raw] of Object.entries(borderosMap)) {
      if (evId === '_consolidado' || !raw || typeof raw !== 'object') continue;
      const b = raw as Record<string, unknown>;
      const meta = metaEventos[evId] || {};
      const loc = meta.localId ? locaisMap[meta.localId] : undefined;
      const localFormatado = loc ? `${loc.nome || ''} · ${loc.cidade || ''}/${loc.uf || ''}` : '';

      lista.push({
        id: evId,
        nome: String(meta.nome || evId),
        data: String(meta.data || ''),
        local: localFormatado,
        liberadoParaSolicitacao: meta.liberadoParaSolicitacao !== false,
        borderoEvento: Number(b.borderoEvento || 0),
        despesas: Number(b.despesas || 0),
        despesasPagas: Number(b.despesasPagas !== undefined ? b.despesasPagas : b.despesas || 0),
        despesasAPagar: Number(b.despesasAPagar || 0),
        retencoes: Array.isArray(b.retencoes) ? b.retencoes : [],
        descontosOperacionais: Array.isArray(b.descontosOperacionais) ? b.descontosOperacionais : [],
        resultado: Number(b.resultado || 0),
        regraTexto: String(b.regraTexto || ''),
        faixaAtual: (b.faixaAtual as BorderoEventoLimpo['faixaAtual']) || null,
        faixas: Array.isArray(b.faixas) ? b.faixas : [],
        pctVendido: Number(b.pctVendido || 0),
        vendidosAtuais: Number(b.vendidosAtuais || 0),
        capacidadeUsada: Number(b.capacidadeUsada || 0),
        proximaFaixa: (b.proximaFaixa as BorderoEventoLimpo['proximaFaixa']) || null,
        dataLiberacaoTotal: String(b.dataLiberacaoTotal || ''),
        escolhido: Number(b.escolhido || 0),
        rebate: Number(b.rebate || 0),
        patrocinio: Number(b.patrocinio || 0),
        jaRepassado: Number(b.jaRepassado || 0),
        advEv: Number(b.advEv || 0),
        antEv: Number(b.antEv || 0),
        liberavel: Number(b.liberavel || 0),
        retido: Number(b.retido || 0)
      });
    }
    acumulado.eventos = lista;
    acumulado.carregado = true;
    onUpdate({ ...acumulado });
  }

  const unsubs = [
    onValue(ref(db, `/produtoras/${produtoraId}`), snap => {
      const val = snap.val() || {};
      acumulado.produtoraNome = String(val.nome || produtoraId);
      acumulado.cnpj = String(val.cnpj || '');
      onUpdate({ ...acumulado });
    }),
    onValue(ref(db, '/config/antecipacao'), snap => {
      const val = snap.val() || {};
      acumulado.antecipacaoConfig = {
        pctLimite: Number(val.pctLimite || 50),
        percentualEncargo: Number(Object.prototype.hasOwnProperty.call(val, 'taxaPct') ? val.taxaPct : 2)
      };
      onUpdate({ ...acumulado });
    }),
    onValue(ref(db, '/locais'), snap => {
      locaisMap = snap.val() || {};
      recomporEventos();
    }),
    onValue(query(ref(db, '/eventos'), orderByChild('produtoraId'), equalTo(produtoraId)), snap => {
      metaEventos = snap.val() || {};
      recomporEventos();
    }),
    onValue(ref(db, `/borderos_produtor/${produtoraId}`), snap => {
      borderosMap = snap.val() || {};
      const cons = (borderosMap._consolidado || {}) as Record<string, unknown>;
      acumulado.consolidado = {
        liberavelEventos: Number(cons.liberavelEventos || 0),
        patrocinioProdutora: Number(cons.patrocinioProdutora || 0),
        patrocinioDescricao: String(cons.patrocinioDescricao || 'Patrocínio da produtora'),
        advConsolidado: Number(cons.advConsolidado || 0),
        devedores: Number(cons.devedores || 0),
        saldoDisponivel: Number(cons.saldoDisponivel || 0),
        tarifaPix: Number(cons.tarifaPix || 0),
        tarifaTed: Number(cons.tarifaTed !== undefined ? cons.tarifaTed : 10),
        atualizadoEm: String(cons.atualizadoEm || '')
      };
      recomporEventos();
    }),
    onValue(ref(db, `/contas/${produtoraId}`), snap => {
      const map = snap.val() || {};
      acumulado.contas = Object.entries(map).map(([id, c]) => {
        const item = c as Record<string, unknown>;
        return {
          id,
          banco: String(item.banco || ''),
          agencia: String(item.agencia || ''),
          conta: String(item.conta || ''),
          pix: String(item.pix || ''),
          titular: String(item.titular || acumulado.produtoraNome),
          status: (item.status as ContaBancariaProdutor['status']) || 'Pendente',
          padrao: Boolean(item.padrao)
        };
      });
      onUpdate({ ...acumulado });
    }),
    onValue(query(ref(db, '/repasses'), orderByChild('produtoraId'), equalTo(produtoraId)), snap => {
      const map = snap.val() || {};
      acumulado.repasses = Object.entries(map).map(([id, r]) => {
        const item = r as Record<string, unknown>;
        return {
          id,
          eventoIds: Array.isArray(item.eventoIds) ? item.eventoIds : [],
          valorSolicitado: Number(item.valorSolicitado || 0),
          tarifaTransferencia: Number(item.tarifaTransferencia || 0),
          valorLiquido: Number(item.valorLiquido || 0),
          forma: (item.forma === 'TED' ? 'TED' : 'PIX') as 'PIX' | 'TED',
          contaId: String(item.contaId || ''),
          status: (item.status as RepasseHistoricoProdutor['status']) || 'Solicitado',
          solicitadoEm: String(item.solicitadoEm || ''),
          protocoloBancario: item.protocoloBancario ? String(item.protocoloBancario) : undefined,
          comprovanteUrl: item.comprovanteUrl ? String(item.comprovanteUrl) : undefined,
          motivoRecusa: item.motivoRecusa ? String(item.motivoRecusa) : undefined
        };
      });
      onUpdate({ ...acumulado });
    }),
    onValue(query(ref(db, '/antecipacoes'), orderByChild('produtoraId'), equalTo(produtoraId)), snap => {
      const map = snap.val() || {};
      acumulado.antecipacoes = Object.entries(map).map(([id, a]) => {
        const item = a as Record<string, unknown>;
        return {
          id,
          eventoId: String(item.eventoId || ''),
          data: String(item.data || ''),
          valor: Number(item.valor || 0),
          percentualEncargo: Number(Object.prototype.hasOwnProperty.call(item, 'taxaPct') ? item.taxaPct : 2),
          status: (item.status as AntecipacaoProdutor['status']) || 'Solicitada'
        };
      });
      onUpdate({ ...acumulado });
    }),
    onValue(query(ref(db, '/despesas'), orderByChild('produtoraId'), equalTo(produtoraId)), snap => {
      const map = snap.val() || {};
      acumulado.despesas = Object.entries(map).map(([id, d]) => {
        const item = d as Record<string, unknown>;
        return {
          id,
          eventoId: String(item.eventoId || ''),
          data: String(item.data || ''),
          categoria: String(item.categoria || ''),
          fornecedor: String(item.fornecedor || ''),
          valor: Number(item.valor || 0),
          status: (item.status as DespesaEventoProdutor['status']) || 'Pago',
          nfCodigo: String(item.nfCodigo || ''),
          comprovanteUrl: item.comprovanteUrl ? String(item.comprovanteUrl) : undefined
        };
      });
      onUpdate({ ...acumulado });
    })
  ];

  return () => {
    unsubs.forEach(u => u());
  };
}

export async function chamarSolicitarRepasse(payload: {
  eventoIds: string[];
  valor: number;
  forma: 'PIX' | 'TED';
  contaId: string;
  aceiteBancario: boolean;
  aceiteTermosBordero: boolean;
}) {
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable(functions, 'solicitarRepasse');
  const res = await fn(payload);
  return res.data;
}

export async function chamarSolicitarAntecipacao(payload: { eventoId: string; valor: number }) {
  const { functions } = obterServicosFirebase();
  const fn = httpsCallable(functions, 'solicitarAntecipacao');
  const res = await fn(payload);
  return res.data;
}

export async function cadastrarContaBancariaRTDB(
  produtoraId: string,
  titular: string,
  novaConta: { banco: string; agencia: string; conta: string; pix: string }
) {
  const { db } = obterServicosFirebase();
  const novaRef = push(ref(db, `/contas/${produtoraId}`));
  await set(novaRef, {
    banco: novaConta.banco.trim(),
    agencia: novaConta.agencia.trim(),
    conta: novaConta.conta.trim(),
    pix: novaConta.pix.trim(),
    titular,
    status: 'Pendente',
    padrao: false
  });
}
