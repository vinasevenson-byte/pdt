import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';
import { formatBRL } from '../../../../apps/financeiro/src/shared/formatters';

export const modulePlugin: FinancialModulePlugin = {
  id: 'chargebacks',
  title: 'Chargebacks e Contestações',
  description: 'Gestão vertical de contestações de adquirentes e retenções preventivas no nó /chargebacks.',
  rtdbNode: 'chargebacks',
  requiresJavaService: false,
  render: (dados) => {
    const mapa = (dados?.chargebacks || {}) as Record<string, Record<string, unknown>>;
    const lista = Object.entries(mapa);
    return (
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>Chargebacks e Contestações (<code>/chargebacks</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Monitoramento de contestações de cartão e retenção preventiva sobre o borderô do evento.
          </p>
        </div>
        {lista.length === 0 ? (
          <p className="sub">Nenhum chargeback aberto em <code>/chargebacks</code>.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>ID</th>
                <th style={{ padding: '8px' }}>Produtora / Evento</th>
                <th style={{ padding: '8px' }}>Status</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor Contestado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(([id, c]) => (
                <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{id}</td>
                  <td style={{ padding: '8px' }}>{String(c.produtoraId || '')} · {String(c.eventoId || '')}</td>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{String(c.status || 'Em Análise')}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>
                    {formatBRL(Number(c.valor || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }
};
