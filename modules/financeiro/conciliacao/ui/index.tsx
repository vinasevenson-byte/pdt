import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';
import { formatBRL } from '../../../../apps/financeiro/src/shared/formatters';

export const modulePlugin: FinancialModulePlugin = {
  id: 'conciliacao',
  title: 'Conciliação OFX',
  description: 'Importação de extratos OFX 1.02/2.x e conciliação determinística contra o Ledger (/conciliacoes).',
  rtdbNode: 'conciliacoes',
  requiresJavaService: true,
  render: (dados) => {
    const mapa = ((dados as Record<string, unknown>)?.conciliacoes || {}) as Record<string, Record<string, unknown>>;
    const lista = Object.entries(mapa);
    return (
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>Conciliação Bancária OFX (<code>/conciliacoes</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Parser OFX 1.02 (SGML) / 2.x (XML) com bloqueio de duplicidade por hash SHA-256, pareamento por protocolo/data+valor e detecção de ambiguidades.
          </p>
        </div>
        {lista.length === 0 ? (
          <p className="sub">Nenhum extrato OFX importado em <code>/conciliacoes</code>.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>ID / Competência</th>
                <th style={{ padding: '8px' }}>Status</th>
                <th style={{ padding: '8px' }}>Hash SHA-256</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Soma Extrato</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Soma Ledger</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(([id, c]) => {
                const res = (c.resumo || {}) as Record<string, unknown>;
                return (
                  <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{id} ({String(c.competencia || '')})</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{String(c.status || '')}</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                      {c.hashArquivo ? `${String(c.hashArquivo).slice(0, 14)}…` : '—'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(res.somaExtrato || 0))}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(res.somaLedger || 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    );
  }
};
