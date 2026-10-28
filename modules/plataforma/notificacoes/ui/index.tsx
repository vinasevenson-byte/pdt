import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';
import {
  chamarCallableFinanceiro,
  type EstadoFinanceiroRTDB
} from '../../../../apps/financeiro/src/shared/firebaseFinanceiro';

function NotificacoesOutboxView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const notifMap = (dados?.notificacoes_central || {}) as Record<string, Record<string, unknown>>;
  const outboxMap = (dados?.eventos_dominio || {}) as Record<string, Record<string, unknown>>;
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = Object.entries(notifMap);
  const pendentesOutbox = Object.values(outboxMap).filter(e => e?.status !== 'Processado').length;

  async function handleProcessar() {
    setErro(null);
    setMsg(null);
    try {
      const res = await chamarCallableFinanceiro('processarFilaNotificacoesOutbox', {});
      setMsg(`Outbox processado: ${String(res.quantidadeNotificacoesGeradas ?? 0)} notificação(ões) gerada(s).`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao processar fila de notificações.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>Notificações, Alertas e Jobs (<code>/notificacoes_central</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Consumo do Transactional Outbox (<code>/eventos_dominio</code>: {pendentesOutbox} pendente(s)) e distribuição sanitizada ao Portal do Produtor.
          </p>
        </div>
        <button
          type="button"
          onClick={handleProcessar}
          className="btn"
          style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}
        >
          Processar Fila Outbox Agora
        </button>
      </div>
      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}
      {lista.length === 0 ? (
        <p className="sub">Nenhuma notificação despachada em <code>/notificacoes_central</code>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>ID</th>
              <th style={{ padding: '8px' }}>Produtora</th>
              <th style={{ padding: '8px' }}>Título</th>
              <th style={{ padding: '8px' }}>Mensagem</th>
              <th style={{ padding: '8px' }}>Data/Hora</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(([id, n]) => (
              <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px', fontWeight: 700 }}>{id}</td>
                <td style={{ padding: '8px' }}>{String(n.produtoraId || '—')}</td>
                <td style={{ padding: '8px', fontWeight: 700 }}>{String(n.titulo || '')}</td>
                <td style={{ padding: '8px' }}>{String(n.mensagem || '')}</td>
                <td style={{ padding: '8px', fontSize: '12px' }}>{String(n.criadaEm || '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'notificacoes',
  title: 'Notificações, Alertas e Jobs',
  description: 'Processador do Transactional Outbox (/eventos_dominio) e central de alertas operacionais para Financeiro e Produtor.',
  rtdbNode: 'notificacoes_central',
  requiresJavaService: false,
  render: (dados) => <NotificacoesOutboxView dados={dados} />
};
