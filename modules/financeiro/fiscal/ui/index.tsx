import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';
import { formatBRL } from '../../../../apps/financeiro/src/shared/formatters';

export const modulePlugin: FinancialModulePlugin = {
  id: 'fiscal',
  title: 'Apuração Fiscal & Retenções',
  description: 'Apuração mensal de ISS, PIS, COFINS, IRPJ, CSLL e retenções de eventos (ISS/ECAD) por competência (/apuracoes_fiscais).',
  rtdbNode: 'apuracoes_fiscais',
  requiresJavaService: false,
  render: (dados) => {
    const mapa = ((dados as Record<string, unknown>)?.apuracoes_fiscais || {}) as Record<string, Record<string, unknown>>;
    const lista = Object.entries(mapa);
    return (
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>Apuração Fiscal &amp; Retenções a Recolher (<code>/apuracoes_fiscais</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Cálculo de tributos sobre receitas de intermediação Disk e retenções de eventos sob responsabilidade da Disk, integrado a <code>/contas_pagar</code> e <code>/lancamentos</code>.
          </p>
        </div>
        {lista.length === 0 ? (
          <p className="sub">Nenhuma apuração fiscal registrada em <code>/apuracoes_fiscais</code>.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Competência</th>
                <th style={{ padding: '8px' }}>Status</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Base Tributável Disk</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Tributos Próprios</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Retenções Eventos</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Total Guias</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(([comp, ap]) => {
                const trib = (ap.tributosProprios || {}) as Record<string, unknown>;
                const ret = (ap.retencoesTerceiros || {}) as Record<string, unknown>;
                return (
                  <tr key={comp} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{comp}</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{String(ap.status || '')}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(ap.baseTributavelDisk || 0))}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(trib.total || 0))}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(ret.saldoARecolher || 0))}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(ap.totalGuiasARecolher || 0))}</td>
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
