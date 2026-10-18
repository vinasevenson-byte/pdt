import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const negociacoesModule: FinancialModulePlugin = {
  id: 'negociacoes',
  title: 'Negociações',
  description: 'Configuração de Taxa Operacional (fixa, percentual ou por ingresso) e conveniência por evento.',
  rtdbNode: 'negociacoes',
  render: (dados) => {
    const negs = Object.entries(dados?.negociacoes || {});
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Negociações Comerciais (<code>/negociacoes</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Parâmetros exclusivos do perfil Financeiro (bloqueados no RTDB para o Produtor).
          </p>
        </div>
        {negs.length === 0 ? (
          <p style={{ color: '#64748b' }}>Nenhuma negociação carregada do RTDB.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Evento ID</th>
                <th style={{ padding: '8px' }}>Tipo Taxa Op</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor Taxa Op</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Rebate (%)</th>
              </tr>
            </thead>
            <tbody>
              {negs.map(([evId, n]) => (
                <tr key={evId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{evId}</td>
                  <td style={{ padding: '8px' }}>{String(n.taxaOpTipo || 'percentual')}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{Number(n.taxaOpValor || 0)}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{Number(n.rebatePct || 0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }
};
