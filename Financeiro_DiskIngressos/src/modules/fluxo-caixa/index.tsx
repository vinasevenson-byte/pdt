import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';

export const fluxoCaixaModule: FinancialModulePlugin = {
  id: 'fluxo_caixa',
  title: 'Fluxo de Caixa',
  description: 'Projetado x Realizado por data útil bancária (D+X) com janelas acumuladas de 30, 60 e 90 dias.',
  rtdbNode: 'fluxo_caixa',
  requiresJavaService: true,
  render: (dados) => {
    const fc = (dados?.fluxoCaixa || {}) as Record<string, unknown>;
    const janelas = (fc.janelas || {}) as Record<string, Record<string, unknown>>;
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Fluxo de Caixa (<code>/fluxo_caixa</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Projeção diária e acumulada (30/60/90 dias) integrando Contas a Receber, Contas a Pagar e calendário bancário FEBRABAN.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {(['d30', 'd60', 'd90'] as const).map(k => {
            const j = janelas[k] || {};
            return (
              <div key={k} style={{ padding: '14px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff' }}>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Janela {k.replace('d', '')} dias</div>
                <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '4px' }}>
                  Saldo Proj.: {formatBRL(Number(j.saldoProjetado || 0))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }
};
