import { useState, useEffect } from 'react';
import type { FinancialModulePlugin } from '../shared/modulePlugin';
import {
  firebaseFinanceiroConfigurado,
  observarSessaoFinanceiro,
  assinarDadosFinanceiroRTDB,
  autenticarFinanceiroEmailSenha,
  encerrarSessaoFinanceiro,
  criarEstadoFinanceiroVazio,
  type SessaoFinanceiro,
  type EstadoFinanceiroRTDB
} from '../shared/firebaseFinanceiro';
import { eventosModule } from '../modules/eventos';
import { negociacoesModule } from '../modules/negociacoes';
import { repassesModule } from '../modules/repasses';
import { antecipacoesModule } from '../modules/antecipacoes';
import { advancedModule } from '../modules/advanced';
import { contasModule } from '../modules/contas';
import { despesasModule } from '../modules/despesas';
import { contasPagarModule } from '../modules/contas-pagar';
import { contasReceberModule } from '../modules/contas-receber';
import { saldosModule } from '../modules/saldos';
import { fluxoCaixaModule } from '../modules/fluxo-caixa';
import { ledgerModule } from '../modules/ledger';

export const REGISTERED_MODULES: FinancialModulePlugin[] = [
  eventosModule,
  negociacoesModule,
  repassesModule,
  antecipacoesModule,
  advancedModule,
  contasModule,
  despesasModule,
  contasPagarModule,
  contasReceberModule,
  saldosModule,
  fluxoCaixaModule,
  ledgerModule
];

export function App() {
  const [activeId, setActiveId] = useState<string>(REGISTERED_MODULES[0].id);
  const [sessao, setSessao] = useState<SessaoFinanceiro | null>(null);
  const [verificandoAuth, setVerificandoAuth] = useState<boolean>(firebaseFinanceiroConfigurado);
  const [dados, setDados] = useState<EstadoFinanceiroRTDB>(() => criarEstadoFinanceiroVazio());
  const [emailLogin, setEmailLogin] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');
  const [erroLogin, setErroLogin] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuth = observarSessaoFinanceiro(s => {
      setSessao(s);
      setVerificandoAuth(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!sessao || !sessao.autorizado) {
      setDados(criarEstadoFinanceiroVazio());
      return;
    }
    const unsubRTDB = assinarDadosFinanceiroRTDB(novoEstado => {
      setDados(novoEstado);
    });
    return () => unsubRTDB();
  }, [sessao]);

  async function handleLogin(ev: React.FormEvent) {
    ev.preventDefault();
    setErroLogin(null);
    try {
      await autenticarFinanceiroEmailSenha(emailLogin, senhaLogin);
    } catch (err) {
      setErroLogin(err instanceof Error ? err.message : 'Credenciais inválidas.');
    }
  }

  const activeModule = REGISTERED_MODULES.find(m => m.id === activeId) || REGISTERED_MODULES[0];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '24px', color: '#0f172a' }}>
      <header
        style={{
          marginBottom: '20px',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '20px' }}>Hub de Repasses DiskIngressos · Painel Financeiro</h1>
          <small style={{ color: '#64748b' }}>
            Guard de Permissão: <code>claims.role === &apos;financeiro&apos;</code> · Projeto: diskingressos-62591 · Movimentação bancária externa desabilitada
          </small>
        </div>
        {sessao && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, background: '#dcfce7', color: '#065f46', padding: '6px 10px', borderRadius: '999px' }}>
              {sessao.email} ({sessao.role})
            </span>
            <button
              onClick={() => encerrarSessaoFinanceiro()}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
            >
              Sair
            </button>
          </div>
        )}
      </header>

      {(!sessao || !sessao.autorizado) ? (
        <section style={{ maxWidth: '460px', margin: '36px auto', padding: '24px', border: '1px solid #cbd5e1', borderRadius: '12px', background: '#fff' }}>
          <h2 style={{ marginTop: 0, fontSize: '18px' }}>Autenticação Obrigatória · Financeiro Disk</h2>
          <p style={{ fontSize: '14px', color: '#475569' }}>
            Acesso restrito a operadores autenticados no Firebase Auth com Custom Claim <code>role === &apos;financeiro&apos;</code>.
          </p>
          {verificandoAuth ? (
            <p style={{ fontSize: '14px', color: '#64748b' }}>Verificando sessão e permissões no Firebase...</p>
          ) : sessao && !sessao.autorizado ? (
            <div style={{ padding: '12px', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>
              Acesso bloqueado: o usuário {sessao.email} possui role &quot;{sessao.role || 'nenhuma'}&quot;, mas este portal exige <code>role === &apos;financeiro&apos;</code>.
            </div>
          ) : (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                E-mail corporativo (Financeiro)
                <input
                  type="email"
                  value={emailLogin}
                  onChange={e => setEmailLogin(e.target.value)}
                  required
                  style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
                Senha
                <input
                  type="password"
                  value={senhaLogin}
                  onChange={e => setSenhaLogin(e.target.value)}
                  required
                  style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </label>
              {erroLogin && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 600 }}>{erroLogin}</div>}
              <button
                type="submit"
                style={{ padding: '10px 14px', borderRadius: '6px', border: 0, background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
              >
                Autenticar no Painel Financeiro
              </button>
            </form>
          )}
        </section>
      ) : (
        <>
          <nav style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
            {REGISTERED_MODULES.map(mod => (
              <button
                key={mod.id}
                onClick={() => setActiveId(mod.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: mod.id === activeId ? '#0f172a' : '#ffffff',
                  color: mod.id === activeId ? '#ffffff' : '#0f172a',
                  cursor: 'pointer'
                }}
              >
                {mod.title}
              </button>
            ))}
          </nav>

          <main>{activeModule.render(dados, sessao)}</main>
        </>
      )}
    </div>
  );
}
export default App;
