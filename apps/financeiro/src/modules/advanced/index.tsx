import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';

export const advancedModule: FinancialModulePlugin = {
  id: 'advanced',
  title: 'Advanced (Adiantamentos)',
  description: 'Adiantamentos contratuais por evento ou no escopo consolidado da produtora.',
  rtdbNode: 'advanced',
  render: (dados) => {
    const lista = Object.entries(dados?.advanced || {});
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Advanced (Adiantamentos Contratuais · <code>/advanced</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Controle de adiantamentos por evento ou consolidado da produtora e saldo a compensar.
          </p>
        </div>
        {lista.length === 0 ? (
          <p style={{ color: '#64748b' }}>Nenhum contrato de Advanced registrado no RTDB.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>ID</th>
                <th style={{ padding: '8px' }}>Produtora</th>
                <th style={{ padding: '8px' }}>Escopo</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor</th>
                <th style={{ padding: '8px' }}>Abater no próximo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(([id, adv]) => (
                <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{id}</td>
                  <td style={{ padding: '8px' }}>{String(adv.produtoraId || '')}</td>
                  <td style={{ padding: '8px' }}>{String(adv.escopo || 'consolidado')}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(adv.valor || 0))}</td>
                  <td style={{ padding: '8px' }}>{adv.abaterNoProximo ? 'Sim' : 'Compensado'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }
};
