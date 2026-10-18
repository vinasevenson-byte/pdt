import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import { decidirAntecipacaoRTDB } from '../../shared/firebaseFinanceiro';

export const antecipacoesModule: FinancialModulePlugin = {
  id: 'antecipacoes',
  title: 'Antecipações',
  description: 'Gestão de solicitações de antecipação sobre saldo retido com taxa configurável.',
  rtdbNode: 'antecipacoes',
  render: (dados, sessao) => {
    const lista = Object.entries(dados?.antecipacoes || {});
    const email = sessao?.email || 'financeiro';
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Antecipações (<code>/antecipacoes</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Controle de limite sobre valor retido e abatimento automático no próximo repasse.
          </p>
        </div>
        {lista.length === 0 ? (
          <p style={{ color: '#64748b' }}>Nenhuma antecipação registrada no RTDB.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>ID / Evento</th>
                <th style={{ padding: '8px' }}>Produtora</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor</th>
                <th style={{ padding: '8px' }}>Status</th>
                <th style={{ padding: '8px' }}>Decisão</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(([id, a]) => {
                const st = String(a.status || 'Solicitada');
                return (
                  <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px' }}><strong>{id}</strong> ({String(a.eventoId || '')})</td>
                    <td style={{ padding: '8px' }}>{String(a.produtoraId || '')}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(a.valor || 0))}</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{st}</td>
                    <td style={{ padding: '8px', display: 'flex', gap: '6px' }}>
                      {st === 'Solicitada' && (
                        <>
                          <button
                            onClick={() => decidirAntecipacaoRTDB(id, 'Aprovada', email)}
                            style={{ padding: '4px 8px', borderRadius: '4px', border: 0, background: '#047857', color: '#fff', cursor: 'pointer' }}
                          >
                            Aprovar
                          </button>
                          <button
                            onClick={() => decidirAntecipacaoRTDB(id, 'Recusada', email)}
                            style={{ padding: '4px 8px', borderRadius: '4px', border: 0, background: '#b91c1c', color: '#fff', cursor: 'pointer' }}
                          >
                            Recusar
                          </button>
                        </>
                      )}
                    </td>
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
