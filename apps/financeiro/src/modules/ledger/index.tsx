import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';

export const ledgerModule: FinancialModulePlugin = {
  id: 'ledger',
  title: 'Ledger & Fechamentos',
  description: 'Razão contábil imutável com partida dobrada (/lancamentos) e congelamento mensal (/fechamentos).',
  rtdbNode: 'lancamentos',
  requiresJavaService: true,
  render: (dados) => {
    const lancs = Object.entries(dados?.lancamentos || {});
    const fechs = Object.entries(dados?.fechamentos || {});
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Ledger de Partida Dobrada (<code>/lancamentos</code>) &amp; Fechamentos (<code>/fechamentos</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Lançamentos imutáveis em centavos inteiros: estornos geram novos lançamentos inversos e períodos fechados ({fechs.length}) bloqueiam escrita retroativa.
          </p>
        </div>
        {lancs.length === 0 ? (
          <p style={{ color: '#64748b' }}>Nenhum lançamento contábil registrado em <code>/lancamentos</code>.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>ID / Competência</th>
                <th style={{ padding: '8px' }}>Débito</th>
                <th style={{ padding: '8px' }}>Crédito</th>
                <th style={{ padding: '8px' }}>Histórico</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {lancs.map(([id, l]) => (
                <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{id} ({String(l.competencia || '')})</td>
                  <td style={{ padding: '8px' }}>{String(l.contaDebito || '')}</td>
                  <td style={{ padding: '8px' }}>{String(l.contaCredito || '')}</td>
                  <td style={{ padding: '8px' }}>{String(l.historico || '')}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(l.valor || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }
};
