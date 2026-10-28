import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';
import {
  chamarConsultarAuditoriaConsolidada,
  type EstadoFinanceiroRTDB
} from '../../../../apps/financeiro/src/shared/firebaseFinanceiro';

function AuditoriaVisView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const auditoriaMap = (dados?.auditoria || {}) as Record<string, Record<string, unknown>>;
  const relatoriosMap = (dados?.auditoria_relatorios || {}) as Record<string, Record<string, unknown>>;
  const repassesMap = (dados?.repasses || {}) as Record<string, Record<string, unknown>>;

  const [modulo, setModulo] = useState('');
  const [usuario, setUsuario] = useState('');
  const [eventoId, setEventoId] = useState('');
  const [textoBusca, setTextoBusca] = useState('');
  const [persistirSnapshot, setPersistirSnapshot] = useState(false);
  const [relatorioCallable, setRelatorioCallable] = useState<Record<string, unknown> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const logsLocais = Object.entries(auditoriaMap)
    .map(([id, item]) => ({ id, ...item }))
    .filter(item => {
      const r = item as Record<string, unknown>;
      if (modulo.trim() && !String(r.modulo || '').toLowerCase().includes(modulo.trim().toLowerCase())) return false;
      if (usuario.trim() && !String(r.usuario || '').toLowerCase().includes(usuario.trim().toLowerCase())) return false;
      if (eventoId.trim() && String(r.eventoId || '') !== eventoId.trim()) return false;
      if (textoBusca.trim()) {
        const q = textoBusca.trim().toLowerCase();
        const texto = `${String(r.acao || '')} ${String(r.resumo || '')} ${String(r.modulo || '')} ${String(r.usuario || '')}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    })
    .reverse();

  const repassesComAssinatura = Object.entries(repassesMap).map(([id, r]) => {
    const assSol = r.assinaturaSolicitante as Record<string, unknown> | undefined;
    const assFin = r.assinaturaFinanceiro as Record<string, unknown> | undefined;
    return {
      id,
      status: String(r.status || ''),
      produtoraId: String(r.produtoraId || ''),
      hashSolicitante: assSol ? String(assSol.hashIntegridade || assSol.hashSha256 || 'presente') : null,
      hashFinanceiro: assFin ? String(assFin.hashIntegridade || assFin.hashSha256 || 'presente') : null
    };
  });

  async function handleConsultarCallable(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      const res = await chamarConsultarAuditoriaConsolidada({
        modulo: modulo.trim() || undefined,
        usuario: usuario.trim() || undefined,
        eventoId: eventoId.trim() || undefined,
        textoBusca: textoBusca.trim() || undefined,
        persistirSnapshot
      });
      setRelatorioCallable(res as Record<string, unknown>);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao executar consultarAuditoriaConsolidada.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <h2 className="h2" style={{ margin: 0 }}>Visualizador de Auditoria e Assinaturas (<code>/auditoria</code> · <code>/auditoria_relatorios</code>)</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Pesquisa interativa de logs operacionais, verificação de integridade de assinaturas eletrônicas de repasses e geração de snapshots de conformidade.
        </p>
      </div>

      <form
        onSubmit={handleConsultarCallable}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px',
          alignItems: 'end',
          background: '#f8fafc',
          padding: '14px',
          borderRadius: '10px',
          border: '1px solid #e2e8f0'
        }}
      >
        <label className="lb" style={{ fontSize: '12px' }}>
          Módulo
          <input className="in tx" value={modulo} onChange={e => setModulo(e.target.value)} placeholder="repasses, admin/usuarios..." />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Usuário / Operador
          <input className="in tx" value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="financeiro@disk..." />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Evento / Produtora ID
          <input className="in tx" value={eventoId} onChange={e => setEventoId(e.target.value)} placeholder="polaquedo, prod_demo..." />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Busca Livre (Ação / Resumo)
          <input className="in tx" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} placeholder="Aprovação, Estorno, Alçada..." />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, paddingBottom: '8px' }}>
          <input type="checkbox" checked={persistirSnapshot} onChange={e => setPersistirSnapshot(e.target.checked)} />
          Gravar Snapshot em <code>/auditoria_relatorios</code>
        </label>
        <button type="submit" className="btn" style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
          Auditar no Servidor
        </button>
      </form>

      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}

      {relatorioCallable && (
        <div style={{ padding: '12px 16px', background: '#ecfdf5', border: '1px solid #047857', borderRadius: '8px', fontSize: '13px' }}>
          <strong>Relatório Consolidado Servidor ({String(relatorioCallable.geradoEm || '')}):</strong>{' '}
          Eventos no Outbox: <strong>{String(relatorioCallable.totalEventosDominioOutbox ?? 0)}</strong> · Snapshots salvos:{' '}
          <strong>{Object.keys(relatoriosMap).length}</strong>
        </div>
      )}

      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: '15px' }}>Verificação de Assinaturas Eletrônicas de Repasses ({repassesComAssinatura.length})</h3>
        {repassesComAssinatura.length === 0 ? (
          <p className="sub">Nenhum repasse registrado para verificação de assinatura.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '12px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '6px 8px' }}>Repasse ID</th>
                <th style={{ padding: '6px 8px' }}>Produtora</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
                <th style={{ padding: '6px 8px' }}>Assinatura Solicitante</th>
                <th style={{ padding: '6px 8px' }}>Assinatura Financeiro</th>
              </tr>
            </thead>
            <tbody>
              {repassesComAssinatura.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>{r.id}</td>
                  <td style={{ padding: '6px 8px' }}>{r.produtoraId}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>{r.status}</td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '12px', color: r.hashSolicitante ? '#065f46' : '#b45309' }}>
                    {r.hashSolicitante ? `${r.hashSolicitante.slice(0, 16)}… (OK)` : 'Sem assinatura'}
                  </td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '12px', color: r.hashFinanceiro ? '#065f46' : '#64748b' }}>
                    {r.hashFinanceiro ? `${r.hashFinanceiro.slice(0, 16)}… (OK)` : 'Aguardando decisão'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: '15px' }}>Trilha de Auditoria Filtrada ({logsLocais.length} registro(s))</h3>
        {logsLocais.length === 0 ? (
          <p className="sub">Nenhum log encontrado em <code>/auditoria</code> para os filtros informados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Data / Hora</th>
                <th style={{ padding: '8px' }}>Usuário</th>
                <th style={{ padding: '8px' }}>Módulo</th>
                <th style={{ padding: '8px' }}>Ref / Evento</th>
                <th style={{ padding: '8px' }}>Ação</th>
                <th style={{ padding: '8px' }}>Resumo</th>
              </tr>
            </thead>
            <tbody>
              {logsLocais.slice(0, 60).map(item => {
                const r = item as Record<string, unknown>;
                return (
                  <tr key={String(r.id)} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap', fontSize: '12px' }}>{String(r.dataHora || '')}</td>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{String(r.usuario || '')}</td>
                    <td style={{ padding: '8px' }}><code>{String(r.modulo || '')}</code></td>
                    <td style={{ padding: '8px' }}>{String(r.eventoId || '—')}</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{String(r.acao || '')}</td>
                    <td style={{ padding: '8px', color: '#334155' }}>{String(r.resumo || '')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'auditoria_vis',
  title: 'Visualizador de Auditoria e Assinaturas',
  description: 'Busca consolidada na trilha de auditoria (/auditoria), verificação de assinaturas eletrônicas de repasses e outbox de eventos de domínio.',
  rtdbNode: 'auditoria_relatorios',
  requiresJavaService: false,
  render: (dados) => <AuditoriaVisView dados={dados} />
};
