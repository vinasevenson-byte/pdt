export function ProdutorModuleView({ dados }: { dados?: Record<string, unknown> }) {
  const eventos = Array.isArray(dados?.eventos) ? (dados?.eventos as Array<Record<string, unknown>>) : [];
  const formatMoeda = (v: number) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const totalVendidos = eventos.reduce((s, e) => s + Number(e.vendidosAtuais || 0), 0);
  const totalCapacidade = eventos.reduce((s, e) => s + Number(e.capacidadeUsada || 0), 0);
  const totalBordero = eventos.reduce((s, e) => s + Number(e.borderoEvento || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <section className="card">
        <h2 className="h2" style={{ margin: 0 }}>🎟️ Vendas, Lotes e Ocupação por Evento</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Acompanhamento de ingressos comercializados, ocupação de capacidade e evolução para destravamento de faixas em <code>/vendas_lotes</code>.
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '14px' }}>
        <div className="kpi" style={{ border: '2px solid #1e3a8a' }}>
          <span>Ingressos Vendidos</span>
          <span className="num" style={{ fontSize: '21px', color: '#1e3a8a' }}>{totalVendidos}</span>
          <span className="sub">Capacidade total considerada: {totalCapacidade}</span>
        </div>
        <div className="kpi" style={{ border: '2px solid #047857' }}>
          <span>Borderô Acumulado</span>
          <span className="num" style={{ fontSize: '20px', color: '#065f46' }}>{formatMoeda(totalBordero)}</span>
          <span className="sub">{eventos.length} evento(s) ativo(s)</span>
        </div>
      </div>

      <section className="card">
        <h3 className="h2" style={{ fontSize: '16px', marginBottom: '10px' }}>Desempenho de Vendas e Gatilhos por Evento</h3>
        {eventos.length === 0 ? (
          <p className="sub">Nenhum lote ou evento processado até o momento.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '8px' }}>Evento / Data</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Vendidos / Cap.</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>% Ocupação</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Borderô do Evento</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Liberável Hoje</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((ev, idx) => (
                  <tr key={String(ev.id || idx)} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px' }}>
                      <strong>{String(ev.nome || ev.id)}</strong>
                      <div className="sub" style={{ fontSize: '12px' }}>{String(ev.data || '')}</div>
                    </td>
                    <td className="num" style={{ padding: '8px', textAlign: 'right' }}>
                      {Number(ev.vendidosAtuais || 0)} / {Number(ev.capacidadeUsada || 0)}
                    </td>
                    <td className="num" style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>
                      {Number(ev.pctVendido || 0).toFixed(1)}%
                    </td>
                    <td className="num" style={{ padding: '8px', textAlign: 'right' }}>
                      {formatMoeda(Number(ev.borderoEvento || 0))}
                    </td>
                    <td className="num" style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#065f46' }}>
                      {formatMoeda(Number(ev.liberavel || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
