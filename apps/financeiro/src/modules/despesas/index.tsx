import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';

export const despesasModule: FinancialModulePlugin = {
  id: 'despesas',
  title: 'Despesas de Eventos',
  description: 'Lançamento de despesas pagas e a pagar vinculadas aos eventos com comprovantes e NF.',
  rtdbNode: 'despesas',
  render: (dados) => {
    const lista = Object.entries(dados?.despesas || {});
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Despesas de Eventos (<code>/despesas</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Despesas lançadas nos eventos com abatimento automático no cálculo do borderô.
          </p>
        </div>
        {lista.length === 0 ? (
          <p style={{ color: '#64748b' }}>Nenhuma despesa registrada no RTDB.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Evento</th>
                <th style={{ padding: '8px' }}>Categoria / Fornecedor</th>
                <th style={{ padding: '8px' }}>NF</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor</th>
                <th style={{ padding: '8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(([id, d]) => (
                <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{String(d.eventoId || '')}</td>
                  <td style={{ padding: '8px' }}>{String(d.categoria || '')} · {String(d.fornecedor || '')}</td>
                  <td style={{ padding: '8px' }}>{String(d.nfCodigo || '')}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(d.valor || 0))}</td>
                  <td style={{ padding: '8px' }}>{String(d.status || '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }
};
