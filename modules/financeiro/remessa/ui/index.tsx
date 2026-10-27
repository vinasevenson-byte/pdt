import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';
import { formatBRL } from '../../../../apps/financeiro/src/shared/formatters';

export const modulePlugin: FinancialModulePlugin = {
  id: 'remessa',
  title: 'Remessa PIX / CNAB 240',
  description: 'Lotes de pagamento CNAB 240 / PIX a partir de contas a pagar aprovadas e baixa por retorno (/remessas).',
  rtdbNode: 'remessas',
  requiresJavaService: false,
  render: (dados) => {
    const mapa = ((dados as Record<string, unknown>)?.remessas || {}) as Record<string, Record<string, unknown>>;
    const lista = Object.entries(mapa);
    return (
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>Remessa Bancária PIX / CNAB 240 (<code>/remessas</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Geração de lotes Febraban 240 posições para títulos aprovados e baixa automática com lançamento no Ledger via arquivo de retorno.
          </p>
        </div>
        {lista.length === 0 ? (
          <p className="sub">Nenhuma remessa bancária gerada em <code>/remessas</code>.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>ID / Sequencial</th>
                <th style={{ padding: '8px' }}>Banco / Data</th>
                <th style={{ padding: '8px' }}>Qtd. Títulos</th>
                <th style={{ padding: '8px' }}>Status</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor Total</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(([id, r]) => (
                <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{id} (#{String(r.numeroSequencial || 1)})</td>
                  <td style={{ padding: '8px' }}>{String(r.codigoBanco || '341')} · {String(r.dataGeracao || '')}</td>
                  <td style={{ padding: '8px' }}>{String(r.quantidadeItens || 0)}</td>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{String(r.status || '')}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(r.valorTotal || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }
};
