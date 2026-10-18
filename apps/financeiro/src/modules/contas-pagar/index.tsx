import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';

export const contasPagarModule: FinancialModulePlugin = {
  id: 'contas_pagar',
  title: 'Contas a Pagar',
  description: 'Obrigações do Disk: repasses aprovados, despesas "A pagar", retenções a recolher (ISS, ECAD, INPI, Alvará) e devolução de advanced.',
  rtdbNode: 'contas_pagar',
  render: (dados) => {
    const lista = Object.entries(dados?.contasPagar || {});
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Contas a Pagar (<code>/contas_pagar</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Gestão de títulos a pagar (Prevista, Aprovada, Paga, Cancelada, Vencida) com baixa integrada ao Ledger de partida dobrada.
          </p>
        </div>
        {lista.length === 0 ? (
          <p style={{ color: '#64748b' }}>Nenhum título a pagar registrado no RTDB.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Título ID</th>
                <th style={{ padding: '8px' }}>Categoria / Favorecido</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor Original</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor Pago</th>
                <th style={{ padding: '8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(([id, t]) => (
                <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{id}</td>
                  <td style={{ padding: '8px' }}>{String(t.categoria || '')} · {String(t.fornecedor || t.produtoraId || '')}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(t.valorOriginal || 0))}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(t.valorPago || 0))}</td>
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
