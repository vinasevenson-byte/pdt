export function ProdutorModuleView({ dados }: { dados?: Record<string, unknown> }) {
  const repasses = Array.isArray(dados?.repasses) ? (dados?.repasses as Array<Record<string, unknown>>) : [];
  const antecipacoes = Array.isArray(dados?.antecipacoes) ? (dados?.antecipacoes as Array<Record<string, unknown>>) : [];
  const formatMoeda = (v: number) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const avisos = [
    ...repasses.map(r => ({
      id: `av_rep_${String(r.id || '')}`,
      titulo: `Repasse #${String(r.id || '')} · Status: ${String(r.status || 'Solicitado')}`,
      data: String(r.pagoEm || r.decididoEm || r.solicitadoEm || 'Recente'),
      detalhe: `Valor líquido: ${formatMoeda(Number(r.valorLiquido ?? r.valorSolicitado ?? 0))} (${String(r.forma || 'PIX')})${r.protocoloBancario ? ` · Protocolo: ${String(r.protocoloBancario)}` : ''}`
    })),
    ...antecipacoes.map(a => ({
      id: `av_ant_${String(a.id || '')}`,
      titulo: `Antecipação #${String(a.id || '')} · Status: ${String(a.status || 'Solicitada')}`,
      data: String(a.data || 'Recente'),
      detalhe: `Evento: ${String(a.eventoId || '')} · Valor solicitado: ${formatMoeda(Number(a.valor || 0))}`
    }))
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <section className="card">
        <h2 className="h2" style={{ margin: 0 }}>🔔 Central de Alertas e Notificações da Produtora</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Avisos automáticos sobre aprovação e liquidação de repasses, antecipações e atualizações de borderô em <code>/notificacoes_central</code>.
        </p>
      </section>

      <section className="card">
        <h3 className="h2" style={{ fontSize: '16px', marginBottom: '10px' }}>Histórico de Comunicados ({avisos.length})</h3>
        {avisos.length === 0 ? (
          <p className="sub">Nenhuma notificação pendente para a sua produtora no momento.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {avisos.map(av => (
              <div
                key={av.id}
                style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #dde2ee', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '14px', color: '#0f1b3d' }}>{av.titulo}</div>
                  <div className="sub" style={{ fontSize: '12.5px', marginTop: '2px' }}>{av.detalhe}</div>
                </div>
                <span className="bdg info" style={{ margin: 0 }}>{av.data}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
