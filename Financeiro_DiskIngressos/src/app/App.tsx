import { useState, useEffect } from 'react';
import '../style.css';
import type { FinancialModulePlugin } from '../shared/modulePlugin';
import { formatBRL } from '../shared/formatters';
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

const MODULE_META: Record<string, { desc: string; icon: 'saldo' | 'repasses' | 'contas' | 'antecipacoes' | 'despesas' }> = {
  eventos: {
    desc: 'Borderô de eventos, bilheteria bruta, cortesias, público vendido e travas de capacidade.',
    icon: 'saldo'
  },
  negociacoes: {
    desc: 'Parâmetros comerciais de Taxa Administrativa, Taxa Operacional, Rebate e Patrocínio.',
    icon: 'despesas'
  },
  repasses: {
    desc: 'Fila de aprovação, recusa, rateio entre eventos e liquidação de repasses solicitados.',
    icon: 'repasses'
  },
  antecipacoes: {
    desc: 'Análise e aprovação de antecipações sobre o saldo retido pelas travas.',
    icon: 'antecipacoes'
  },
  advanced: {
    desc: 'Controle de adiantamentos contratuais (Advanced), spread e recomposição de saldo.',
    icon: 'antecipacoes'
  },
  contas: {
    desc: 'Validação de titularidade CNPJ, contas correntes e chaves PIX das produtoras.',
    icon: 'contas'
  },
  despesas: {
    desc: 'Custos diretos, notas fiscais, descontos operacionais e retenções do borderô.',
    icon: 'despesas'
  },
  'contas-pagar': {
    desc: 'Obrigações financeiras de repasses, fornecedores de eventos e retenções.',
    icon: 'contas'
  },
  'contas-receber': {
    desc: 'Direitos creditórios sobre adquirentes, PIX e faturamento de taxas.',
    icon: 'contas'
  },
  saldos: {
    desc: 'Visão consolidada do saldo disponível, liberável, retido e repassado por produtora.',
    icon: 'saldo'
  },
  'fluxo-caixa': {
    desc: 'Projeção diária e consolidada de entradas e saídas operacionais.',
    icon: 'saldo'
  },
  ledger: {
    desc: 'Livro razão em partidas dobradas, fechamento contábil e trilha de auditoria.',
    icon: 'despesas'
  }
};

function ModuleIcon({ kind }: { kind: 'saldo' | 'repasses' | 'contas' | 'antecipacoes' | 'despesas' }) {
  if (kind === 'saldo') {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 15h4" />
      </svg>
    );
  }
  if (kind === 'repasses') {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 17L17 7M17 7H8M17 7v9" />
      </svg>
    );
  }
  if (kind === 'contas') {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18" />
      </svg>
    );
  }
  if (kind === 'antecipacoes') {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  );
}

export function App() {
  const [activeId, setActiveId] = useState<string>('inicio');
  const [q, setQ] = useState<string>('');
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

  const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1';
  const urlVisaoProdutor = `http://${host}:5174`;

  const saldosList = Object.values(dados.saldos || {});
  const saldoDisponivelTotal = saldosList.reduce((a, s) => a + Number(s.saldoDisponivel || 0), 0);
  const liberavelTotal = saldosList.reduce((a, s) => a + Number(s.saldoLiberavel || 0), 0);
  const retidoTotal = saldosList.reduce((a, s) => a + Number(s.saldoRetido || 0), 0);
  const jaRepassadoTotal = saldosList.reduce((a, s) => a + Number(s.totalRepassadoLiquido || 0), 0);
  const eventosEntries = Object.entries(dados.eventos || {});
  const repassesPendentes = Object.values(dados.repasses || {}).filter(r => r.status === 'Solicitado').length;

  const totDonut = Math.max(1, jaRepassadoTotal + liberavelTotal + retidoTotal);
  const a1 = (jaRepassadoTotal / totDonut) * 360;
  const a2 = ((jaRepassadoTotal + liberavelTotal) / totDonut) * 360;
  const donutGradient = `#2f55c4 0deg ${a1.toFixed(1)}deg, #0f8a5f ${a1.toFixed(1)}deg ${a2.toFixed(1)}deg, #e0661b ${a2.toFixed(1)}deg 360deg`;

  const qNorm = q.trim().toLowerCase();
  const modulosFiltrados = qNorm
    ? REGISTERED_MODULES.filter(m => {
        const meta = MODULE_META[m.id];
        return (
          m.title.toLowerCase().includes(qNorm) ||
          (meta && meta.desc.toLowerCase().includes(qNorm))
        );
      })
    : REGISTERED_MODULES;

  const activeModule = REGISTERED_MODULES.find(m => m.id === activeId) || REGISTERED_MODULES[0];

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif", color: '#0f1b3d', minHeight: '100vh', boxSizing: 'border-box' }}>
      <header
        style={{
          background: '#1e3a8a',
          color: '#fff',
          padding: '20px 32px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#c7d2fe' }}>
            DiskIngressos · Hub de Repasses
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800 }}>
            Painel Financeiro Disk · Visão Interna
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              background: '#fff',
              color: '#1e3a8a',
              fontSize: '12px',
              fontWeight: 800,
              padding: '8px 14px',
              borderRadius: '999px',
              textTransform: 'uppercase',
              letterSpacing: '.06em'
            }}
          >
            Financeiro · role=financeiro
          </span>
          <a
            href={urlVisaoProdutor}
            style={{
              background: 'rgba(255,255,255,0.14)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.35)',
              fontSize: '13px',
              fontWeight: 700,
              padding: '10px 16px',
              borderRadius: '10px',
              textDecoration: 'none'
            }}
          >
            Visão Produtor →
          </a>
          {sessao && (
            <button
              className="btn"
              style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', minHeight: '38px', fontSize: '13px' }}
              onClick={() => encerrarSessaoFinanceiro()}
            >
              Sair ({sessao.email})
            </button>
          )}
        </div>
      </header>

      {(!sessao || !sessao.autorizado) ? (
        <div style={{ maxWidth: '480px', margin: '48px auto', padding: '0 24px' }}>
          <section className="card">
            <h2 className="h2">Autenticação Obrigatória · Financeiro Disk</h2>
            <p className="sub">
              Acesso restrito a operadores autenticados no Firebase Auth com Custom Claim <code>role === &apos;financeiro&apos;</code>.
            </p>
            {verificandoAuth ? (
              <p className="sub">Verificando sessão e permissões no Firebase...</p>
            ) : sessao && !sessao.autorizado ? (
              <div style={{ padding: '12px', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>
                Acesso bloqueado: o usuário {sessao.email} possui role &quot;{sessao.role || 'nenhuma'}&quot;, mas este portal exige <code>role === &apos;financeiro&apos;</code>.
              </div>
            ) : (
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label className="lb">
                  E-mail corporativo (Financeiro)
                  <input
                    className="in tx"
                    type="email"
                    value={emailLogin}
                    onChange={e => setEmailLogin(e.target.value)}
                    required
                  />
                </label>
                <label className="lb">
                  Senha
                  <input
                    className="in tx"
                    type="password"
                    value={senhaLogin}
                    onChange={e => setSenhaLogin(e.target.value)}
                    required
                  />
                </label>
                {erroLogin && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 600 }}>{erroLogin}</div>}
                <button
                  type="submit"
                  className="btn"
                  style={{ background: '#1e3a8a', color: '#fff' }}
                >
                  Autenticar no Painel Financeiro
                </button>
              </form>
            )}
          </section>
        </div>
      ) : (
        <>
          <nav
            aria-label="Menu financeiro Disk"
            style={{
              background: '#fff',
              borderBottom: '1px solid #dde2ee',
              padding: '0 24px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <button
              className="btn"
              style={{
                background: activeId === 'inicio' ? '#1e3a8a' : '#eef2ff',
                color: activeId === 'inicio' ? '#fff' : '#1e3a8a',
                marginRight: '12px',
                minHeight: '42px',
                fontSize: '14px'
              }}
              onClick={() => setActiveId('inicio')}
            >
              {activeId === 'inicio' ? 'Visão Geral' : '← Menu'}
            </button>
            {REGISTERED_MODULES.map(mod => (
              <button
                key={mod.id}
                className={mod.id === activeId ? 'tabOn' : 'tab'}
                onClick={() => setActiveId(mod.id)}
              >
                {mod.title}
              </button>
            ))}
          </nav>

          <div style={{ maxWidth: '1376px', margin: '0 auto', padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {activeId === 'inicio' ? (
              <>
                <div className="grp">Visão geral · Carteira DiskIngressos</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
                  <div className="kpi" style={{ border: '2px solid #047857' }}>
                    <span>Saldo disponível</span>
                    <span className="num" style={{ fontSize: '22px', color: '#065f46' }}>{formatBRL(saldoDisponivelTotal)}</span>
                  </div>
                  <div className="kpi">
                    <span>Liberável nos eventos</span>
                    <span className="num" style={{ fontSize: '20px' }}>{formatBRL(liberavelTotal)}</span>
                  </div>
                  <div className="kpi">
                    <span>Retido pelas travas</span>
                    <span className="num" style={{ fontSize: '20px', color: '#9a3412' }}>{formatBRL(retidoTotal)}</span>
                  </div>
                  <div className="kpi">
                    <span>Repassado até hoje</span>
                    <span className="num" style={{ fontSize: '20px' }}>{formatBRL(jaRepassadoTotal)}</span>
                  </div>
                  <div className="kpi">
                    <span>Eventos abertos</span>
                    <span className="num" style={{ fontSize: '20px' }}>{eventosEntries.length}</span>
                    <span className="sub">{repassesPendentes} repasse(s) em análise</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'stretch' }}>
                  <section className="card" style={{ flex: '1 1 420px', minWidth: 0 }}>
                    <h2 className="h2">Para onde vai o resultado dos eventos</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px' }}>
                      <div
                        style={{
                          position: 'relative',
                          width: '176px',
                          height: '176px',
                          borderRadius: '50%',
                          background: `conic-gradient(${donutGradient})`,
                          flex: 'none'
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: '26px',
                            borderRadius: '50%',
                            background: '#fff',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            padding: '6px'
                          }}
                        >
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#5a6584', textTransform: 'uppercase' }}>
                            Total eventos
                          </span>
                          <span className="num" style={{ fontSize: '14px', color: '#0f1b3d', marginTop: '2px' }}>
                            {formatBRL(jaRepassadoTotal + liberavelTotal + retidoTotal)}
                          </span>
                        </div>
                      </div>
                      <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {[
                          { label: 'Já recebido', v: jaRepassadoTotal, color: '#2f55c4' },
                          { label: 'Liberável agora', v: liberavelTotal, color: '#0f8a5f' },
                          { label: 'Retido pelas travas', v: retidoTotal, color: '#e0661b' }
                        ].map(s => (
                          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: s.color }} />
                              {s.label}
                            </span>
                            <span className="num">
                              {formatBRL(s.v)} <span style={{ color: '#5a6584' }}>({Math.round((s.v / totDonut) * 100)}%)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="card" style={{ flex: '1 1 460px', minWidth: 0 }}>
                    <h2 className="h2">Vendas × travas de capacidade</h2>
                    {eventosEntries.map(([id, ev]) => {
                      const vendidos = Number(ev.ingressosVendidos || 0);
                      const cap = Math.max(1, Number(ev.capacidadeLiberada || 2000));
                      const pct = Math.round((vendidos / cap) * 1000) / 10;
                      const bilheteria = Number(ev.bilheteria || 0);
                      const chip = pct >= 80 ? 'Faixa 75%' : pct >= 50 ? 'Faixa 50%' : pct >= 30 ? 'Faixa 30%' : 'Abaixo do gatilho (30%)';
                      const chipBg = pct >= 30 ? '#dcfce7' : '#ffedd5';
                      const chipFg = pct >= 30 ? '#065f46' : '#9a3412';
                      return (
                        <div key={id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', padding: '8px 0', borderTop: '1px solid #eef1f7' }}>
                          <div style={{ flex: '2 1 180px' }}>
                            <div style={{ fontWeight: 800 }}>{String(ev.nome || id)}</div>
                            <div className="sub">{String(ev.data || '')}</div>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 800, padding: '5px 10px', borderRadius: '999px', background: chipBg, color: chipFg }}>
                            {chip}
                          </span>
                          <div style={{ flex: '2 1 160px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ position: 'relative', height: '12px', background: '#e3e7f1', borderRadius: '999px' }}>
                              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: '999px', background: '#1e3a8a', width: `${Math.min(100, pct)}%` }} />
                              {[30, 50, 80].map(g => (
                                <div key={g} style={{ position: 'absolute', top: '-2px', bottom: '-2px', width: '2px', background: '#c2410c', left: `${g}%` }} />
                              ))}
                            </div>
                            <span className="sub" style={{ fontSize: '12px' }}>{pct.toLocaleString('pt-BR')}% vendido ({vendidos}/{cap})</span>
                          </div>
                          <span className="num" style={{ flex: '1 1 110px', textAlign: 'right', color: '#065f46' }}>
                            {formatBRL(bilheteria)}
                          </span>
                        </div>
                      );
                    })}
                  </section>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #dde2ee', borderRadius: '12px', overflow: 'hidden' }}>
                  <span style={{ width: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a6584' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M20 20l-3.5-3.5" />
                    </svg>
                  </span>
                  <input
                    aria-label="Buscar módulo financeiro"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Buscar módulo financeiro..."
                    style={{ border: 0, outline: 'none', flex: 1, font: "500 16px 'Manrope', sans-serif", padding: '14px 16px 14px 0', minHeight: '52px', color: '#0f1b3d', background: 'transparent' }}
                  />
                </label>

                <div className="grp">Operações de caixa e módulos financeiros</div>
                <div className="mods">
                  {modulosFiltrados.map(mod => {
                    const meta = MODULE_META[mod.id] || { desc: mod.title, icon: 'saldo' as const };
                    const badge =
                      mod.id === 'saldos'
                        ? formatBRL(saldoDisponivelTotal)
                        : mod.id === 'repasses' && repassesPendentes > 0
                        ? `${repassesPendentes} pendente(s)`
                        : undefined;
                    return (
                      <button key={mod.id} className="mod" onClick={() => setActiveId(mod.id)}>
                        <span className="ic">
                          <ModuleIcon kind={meta.icon} />
                        </span>
                        <span>
                          <span className="mtt">{mod.title}</span>
                          <span className="mtd">{meta.desc}</span>
                          {badge ? <span className="bdg">{badge}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <main>{activeModule.render(dados, sessao)}</main>
            )}
          </div>
        </>
      )}
    </div>
  );
}
export default App;
