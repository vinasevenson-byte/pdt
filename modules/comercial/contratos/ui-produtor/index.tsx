export function ProdutorModuleView({ dados }: { dados?: Record<string, unknown> }) {
  const eventos = Array.isArray(dados?.eventos) ? (dados?.eventos as Array<Record<string, unknown>>) : [];
  const contratosMap = (dados?.contratos as Record<string, Record<string, unknown>>) || {};
  const contratosLista = Object.entries(contratosMap);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <section className="card">
        <h2 className="h2" style={{ margin: 0 }}>📜 Contratos e Termos de Liberação de Eventos</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Consulta dos termos de liberação por capacidade vendida, prazos D+X bancários e versões assinadas da sua produtora em <code>/contratos</code>.
        </p>
      </section>

      {contratosLista.length > 0 && (
        <section className="card">
          <h3 className="h2" style={{ fontSize: '16px', marginBottom: '10px' }}>Versões Contratuais Seladas (SHA-256)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Evento</th>
                <th style={{ padding: '8px' }}>Nº Contrato</th>
                <th style={{ padding: '8px' }}>Versão</th>
                <th style={{ padding: '8px' }}>Selo de Integridade</th>
                <th style={{ padding: '8px' }}>Atualizado Em</th>
              </tr>
            </thead>
            <tbody>
              {contratosLista.map(([evId, c]) => (
                <tr key={evId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{evId}</td>
                  <td style={{ padding: '8px' }}>{String(c.numeroContrato || 'CTR-VIGENTE')}</td>
                  <td style={{ padding: '8px', fontWeight: 700 }}>v{String(c.versaoAtual || 1)}</td>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                    {c.hashTermosSha256 ? `${String(c.hashTermosSha256).slice(0, 16)}…` : 'Verificado'}
                  </td>
                  <td style={{ padding: '8px' }}>{String(c.atualizadoEm || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h3 className="h2" style={{ fontSize: '16px', marginBottom: '10px' }}>Regras de Destravamento por Evento Vinculado</h3>
        {eventos.length === 0 ? (
          <p className="sub">Nenhum evento vinculado encontrado para exibir regras contratuais.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {eventos.map((ev, idx) => (
              <div
                key={String(ev.id || idx)}
                style={{ padding: '14px', borderRadius: '10px', border: '1px solid #dde2ee', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '6px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <strong style={{ fontSize: '15px' }}>{String(ev.nome || ev.id)}</strong>
                  <span className="bdg">{ev.liberadoParaSolicitacao !== false ? 'Habilitado p/ Repasse' : 'Bloqueado'}</span>
                </div>
                <div className="sub" style={{ fontSize: '13px' }}>
                  Data: {String(ev.data || '—')} · Local: {String(ev.local || '—')}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e3a8a' }}>
                  {String(ev.regraTexto || 'Gatilhos de capacidade conforme borderô oficial do evento.')}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
