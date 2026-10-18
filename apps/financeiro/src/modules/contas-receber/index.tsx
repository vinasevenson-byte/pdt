import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';

export const contasReceberModule: FinancialModulePlugin = {
  id: 'contas_receber',
  title: 'Contas a Receber',
  description: 'Valores a receber de adquirentes/gateways, taxas do Disk, advanced a compensar e antecipações a receber.',
  rtdbNode: 'contas_receber',
  render: (dados) => {
    const lista = Object.entries(dados?.contasReceber || {});
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Contas a Receber (<code>/contas_receber</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Controle de recebíveis de bilheteria, taxas e compensações com liquidação em centavos inteiros.
          </p>
        </div>
        {lista.length === 0 ? (
          <p style={{ color: '#64748b' }}>Nenhum título a receber registrado no RTDB.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Título ID</th>
                <th style={{ padding: '8px' }}>Categoria / Evento</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor Original</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor Recebido</th>
                <th style={{ padding: '8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(([id, t]) => (
                <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{id}</td>
                  <td style={{ padding: '8px' }}>{String(t.categoria || '')} · {String(t.eventoId || '')}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(t.valorOriginal || 0))}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(t.valorRecebido || 0))}</td>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{String(t.status || 'Prevista')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }
};
