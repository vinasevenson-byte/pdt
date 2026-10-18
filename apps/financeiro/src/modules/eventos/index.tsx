import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';

export const eventosModule: FinancialModulePlugin = {
  id: 'eventos',
  title: 'Eventos e Travas',
  description: 'Apuração de borderô, travas por resultado (Regra A) e capacidade em faixas (Regra B), retenções e simulador E se?.',
  rtdbNode: 'eventos_fin',
  render: (dados) => {
    const eventos = Object.entries(dados?.eventos || {});
    const eventosFin = dados?.eventosFin || {};
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Eventos e Travas (<code>/eventos</code> + <code>/eventos_fin</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Gestão de capacidade, travas de liberação (MIN / A / B), retenções, descontos operacionais e créditos limitados à Taxa Adm.
          </p>
        </div>
        {eventos.length === 0 ? (
          <p style={{ color: '#64748b' }}>Nenhum evento carregado do RTDB.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Evento</th>
                <th style={{ padding: '8px' }}>Produtora</th>
                <th style={{ padding: '8px' }}>Data</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Borderô Bruto</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Taxa Adm (%)</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Já Repassado</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map(([id, ev]) => {
                const fin = (eventosFin[id] || {}) as Record<string, unknown>;
                return (
                  <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{String(ev.nome || id)}</td>
                    <td style={{ padding: '8px' }}>{String(ev.produtoraId || '')}</td>
                    <td style={{ padding: '8px' }}>{String(ev.data || '')}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(fin.borderoBruto || 0))}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{Number(fin.taxaAdmPct || 0)}%</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(ev.jaRepassado || 0))}</td>
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
