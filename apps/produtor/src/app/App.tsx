import { useState, useEffect } from 'react';
import '../style.css';
import { criarEstadoProdutorVazio, type EstadoProdutorRTDB } from '../shared/dadosProdutor';
import {
  firebaseConfigurado,
  observarSessaoProdutor,
  assinarDadosProdutorRTDB,
  autenticarProdutorEmailSenha,
  encerrarSessaoProdutor,
  type SessaoProdutor
} from '../shared/firebaseProdutor';
import { InicioProdutorModule } from '../modules/inicio';
import { SaldoProdutorModule } from '../modules/saldo';
import { RepassesProdutorModule } from '../modules/repasses';
import { ContasProdutorModule } from '../modules/contas';
import { AntecipacoesProdutorModule } from '../modules/antecipacoes';
import { DespesasProdutorModule } from '../modules/despesas';
import { BorderoProdutorModule } from '../modules/bordero';

const TABS = [
  { id: 'saldo', label: 'Saldo Consolidado' },
  { id: 'repasses', label: 'Solicitar Repasse' },
  { id: 'contas', label: 'Contas Bancárias' },
  { id: 'antecipacoes', label: 'Antecipações' },
  { id: 'despesas', label: 'Despesas' },
  { id: 'bordero', label: 'Borderô' }
];

export function App() {
  const [activeTab, setActiveTab] = useState<string>('inicio');
  const [sessao, setSessao] = useState<SessaoProdutor | null>(null);
  const [verificandoAuth, setVerificandoAuth] = useState<boolean>(firebaseConfigurado);
  const [dados, setDados] = useState<EstadoProdutorRTDB>(() => criarEstadoProdutorVazio());
  const [emailLogin, setEmailLogin] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');
  const [erroLogin, setErroLogin] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuth = observarSessaoProdutor(s => {
      setSessao(s);
      setVerificandoAuth(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!sessao || !sessao.autorizado || !sessao.produtoraId) {
      setDados(criarEstadoProdutorVazio());
      return;
    }
    const unsubRTDB = assinarDadosProdutorRTDB(sessao.produtoraId, novoEstado => {
      setDados(novoEstado);
    });
    return () => unsubRTDB();
  }, [sessao]);

  async function handleLogin(ev: React.FormEvent) {
    ev.preventDefault();
    setErroLogin(null);
    try {
      await autenticarProdutorEmailSenha(emailLogin, senhaLogin);
    } catch (err) {
      setErroLogin(err instanceof Error ? err.message : 'Credenciais inválidas.');
    }
  }

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
            DiskIngressos · Hub do Produtor
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800 }}>
            {dados.produtoraNome || (sessao?.produtoraId ?? 'Portal do Produtor')}
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
            Produtor · acesso limitado
          </span>
          {sessao && (
            <button
              className="btn"
              style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', minHeight: '38px', fontSize: '13px' }}
              onClick={() => encerrarSessaoProdutor()}
            >
              Sair ({sessao.email})
            </button>
          )}
        </div>
      </header>

      {(!sessao || !sessao.autorizado) ? (
        <div style={{ maxWidth: '480px', margin: '48px auto', padding: '0 24px' }}>
          <section className="card">
            <h2 className="h2">Acesso restrito · Portal do Produtor</h2>
            <p className="sub">
              Autentique-se com sua conta vinculada à produtora (Custom Claim <code>role=produtor</code> + <code>produtoraId</code>).
            </p>
            {verificandoAuth ? (
              <div className="sub">Verificando sessão no Firebase Authentication...</div>
            ) : sessao && !sessao.autorizado ? (
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#b91c1c', background: '#fef2f2', padding: '12px', borderRadius: '10px' }}>
                Sua conta ({sessao.email}) não possui permissão de produtor ou produtora vinculada.
              </div>
            ) : (
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label className="lb">
                  E-mail corporativo
                  <input className="in tx" type="email" value={emailLogin} onChange={e => setEmailLogin(e.target.value)} required />
                </label>
                <label className="lb">
                  Senha
                  <input className="in tx" type="password" value={senhaLogin} onChange={e => setSenhaLogin(e.target.value)} required />
                </label>
                {erroLogin && <div style={{ fontSize: '13px', fontWeight: 700, color: '#b91c1c' }}>{erroLogin}</div>}
                <button className="btn" type="submit" style={{ background: '#1e3a8a', color: '#fff' }}>
                  Entrar no Hub do Produtor
                </button>
              </form>
            )}
          </section>
        </div>
      ) : (
        <>
          {activeTab !== 'inicio' && (
            <nav
              aria-label="Menu financeiro do produtor"
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
                style={{ background: '#eef2ff', color: '#1e3a8a', marginRight: '12px', minHeight: '44px', fontSize: '14px' }}
                onClick={() => setActiveTab('inicio')}
              >
                ← Menu
              </button>
              {TABS.map(t => (
                <button
                  key={t.id}
                  className={activeTab === t.id ? 'tabOn' : 'tab'}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          )}

          <div style={{ maxWidth: '1376px', margin: '0 auto', padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {activeTab === 'inicio' && <InicioProdutorModule dados={dados} onNavigate={setActiveTab} />}
            {activeTab === 'saldo' && <SaldoProdutorModule dados={dados} onSolicitarRepasse={() => setActiveTab('repasses')} />}
            {activeTab === 'repasses' && <RepassesProdutorModule dados={dados} />}
            {activeTab === 'contas' && <ContasProdutorModule dados={dados} />}
            {activeTab === 'antecipacoes' && <AntecipacoesProdutorModule dados={dados} />}
            {activeTab === 'despesas' && <DespesasProdutorModule dados={dados} />}
            {activeTab === 'bordero' && <BorderoProdutorModule dados={dados} />}
          </div>
        </>
      )}
    </div>
  );
}
export default App;
