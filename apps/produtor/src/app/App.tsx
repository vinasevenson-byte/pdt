import { useState } from 'react';
import '../style.css';
import { PROJECAO_INICIAL_PRODUTOR } from '../shared/dadosProdutor';
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
          <div style={{ fontSize: '24px', fontWeight: 800 }}>{PROJECAO_INICIAL_PRODUTOR.produtoraNome}</div>
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
        </div>
      </header>

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
        {activeTab === 'inicio' && <InicioProdutorModule onNavigate={setActiveTab} />}
        {activeTab === 'saldo' && <SaldoProdutorModule onSolicitarRepasse={() => setActiveTab('repasses')} />}
        {activeTab === 'repasses' && <RepassesProdutorModule />}
        {activeTab === 'contas' && <ContasProdutorModule />}
        {activeTab === 'antecipacoes' && <AntecipacoesProdutorModule />}
        {activeTab === 'despesas' && <DespesasProdutorModule />}
        {activeTab === 'bordero' && <BorderoProdutorModule />}
      </div>
    </div>
  );
}
export default App;
