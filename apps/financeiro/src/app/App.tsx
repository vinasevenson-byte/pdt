import { useState } from 'react';
import type { FinancialModulePlugin } from '../shared/modulePlugin';
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
  const activeModule = REGISTERED_MODULES.find(m => m.id === activeId) || REGISTERED_MODULES[0];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
      <header style={{ marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
        <h1 style={{ margin: 0, fontSize: '20px' }}>Hub de Repasses DiskIngressos · Painel Financeiro</h1>
        <small style={{ color: '#64748b' }}>Role exigida: <code>financeiro</code> · Projeto: diskingressos-62591</small>
      </header>

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

      <main>{activeModule.render()}</main>
    </div>
  );
}
