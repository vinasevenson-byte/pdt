import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';

export const saldosModule: FinancialModulePlugin = {
  id: 'saldos',
  title: 'Saldos por Produtora',
  description: 'Posição consolidada por produtora: retido, liberável, repassado, em antecipação e advanced em aberto.',
  rtdbNode: 'saldos',
  render: (dados) => {
    const lista = Object.entries(dados?.saldos || {});
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Posição de Saldos (<code>/saldos/&#123;produtoraId&#125;</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Visão consolidada do Financeiro e geração da projeção limpa <code>/extrato_produtor/&#123;produtoraId&#125;</code>.
          </p>
        </div>
        {lista.length === 0 ? (
          <p style={{ color: '#64748b' }}>Nenhuma posição de saldo encontrada em <code>/saldos</code>.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Produtora</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Liberável</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Retido</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Saldo Disponível</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(([prodId, s]) => (
                <tr key={prodId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{prodId}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(s.liberavelTotal || s.liberavelEventos || 0))}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(s.retidoTotal || 0))}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(s.saldoDisponivel || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }
};
