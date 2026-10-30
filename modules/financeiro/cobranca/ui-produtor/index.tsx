export function ProdutorModuleView({ dados }: { dados?: Record<string, unknown> }) {
  const consolidado = (dados?.consolidado as Record<string, unknown>) || {};
  const eventos = Array.isArray(dados?.eventos) ? (dados?.eventos as Array<Record<string, unknown>>) : [];
  const formatMoeda = (v: number) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const liberavelEventos = Number(consolidado.liberavelEventos || 0);
  const devedores = Number(consolidado.devedores || 0);
  const advConsolidado = Number(consolidado.advConsolidado || 0);
  const saldoDisponivel = Number(consolidado.saldoDisponivel || 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <section className="card">
        <h2 className="h2" style={{ margin: 0 }}>⚖️ Posição de Compensação entre Eventos e Devedores</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Transparência na apuração de resultados por evento, abatimento de adiantamentos e eventual saldo devedor residual em <code>/cobrancas_devedores</code>.
        </p>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '14px' }}>
        <div className="kpi" style={{ border: '2px solid #047857' }}>
          <span>Liberável Bruto Eventos</span>
          <span className="num" style={{ fontSize: '20px', color: '#065f46' }}>{formatMoeda(liberavelEventos)}</span>
          <span className="sub">Eventos superavitários</span>
        </div>
        <div className="kpi">
          <span>Adiantamentos a Compensar</span>
          <span className="num" style={{ fontSize: '20px', color: '#9a3412' }}>{formatMoeda(advConsolidado)}</span>
          <span className="sub">Abatimento contratual</span>
        </div>
        <div className="kpi">
          <span>Saldo Devedor de Eventos</span>
          <span className="num" style={{ fontSize: '20px', color: devedores > 0 ? '#b91c1c' : '#0f1b3d' }}>{formatMoeda(devedores)}</span>
          <span className="sub">{devedores > 0 ? 'Compensado no consolidado' : 'Sem débitos pendentes'}</span>
        </div>
        <div className="kpi" style={{ border: '2px solid #1e3a8a' }}>
          <span>Saldo Líquido Disponível</span>
          <span className="num" style={{ fontSize: '21px', color: '#1e3a8a' }}>{formatMoeda(saldoDisponivel)}</span>
          <span className="sub">Livre para solicitação</span>
        </div>
      </div>

      <section className="card">
        <h3 className="h2" style={{ fontSize: '16px', marginBottom: '10px' }}>Situação Individual por Evento</h3>
        {eventos.length === 0 ? (
          <p className="sub">Nenhum evento encontrado para demonstrar compensação.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Evento</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Resultado</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Liberável</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Saldo Devedor</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((ev, idx) => (
                <tr key={String(ev.id || idx)} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{String(ev.nome || ev.id)}</td>
                  <td className="num" style={{ padding: '8px', textAlign: 'right' }}>{formatMoeda(Number(ev.resultado || 0))}</td>
                  <td className="num" style={{ padding: '8px', textAlign: 'right', color: '#065f46' }}>{formatMoeda(Number(ev.liberavel || 0))}</td>
                  <td className="num" style={{ padding: '8px', textAlign: 'right', color: Number(ev.saldoDevedor || 0) > 0 ? '#b91c1c' : '#475569' }}>
                    {formatMoeda(Number(ev.saldoDevedor || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
