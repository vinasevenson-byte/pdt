import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';
import {
  chamarCallableFinanceiro,
  type EstadoFinanceiroRTDB
} from '../../../../apps/financeiro/src/shared/firebaseFinanceiro';
import { formatBRL } from '../../../../apps/financeiro/src/shared/formatters';

function ChargebacksInteractiveView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const mapa = (dados?.chargebacks || {}) as Record<string, Record<string, unknown>>;
  const eventos = dados?.eventos || {};
  const [eventoId, setEventoId] = useState(Object.keys(eventos)[0] || 'polaquedo');
  const [protocoloAdquirente, setProtocoloAdquirente] = useState('CBK-STONE-2026-01');
  const [valorContestado, setValorContestado] = useState('240');
  const [motivoContestacao, setMotivoContestacao] = useState('Contestação de compra online pelo portador');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = Object.entries(mapa);
  const totalContestado = lista.reduce((s, [, c]) => s + Number(c.valor || 0), 0);

  async function handleRegistrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      const prodId = String((eventos[eventoId] || {}).produtoraId || 'prod_exemplo');
      await chamarCallableFinanceiro('processar_financeiro_chargebacks', {
        produtoraId: prodId,
        eventoId: eventoId.trim(),
        protocoloAdquirente: protocoloAdquirente.trim(),
        valor: Number(valorContestado),
        motivo: motivoContestacao.trim()
      });
      setMsg(`✓ Contestação de chargeback (${protocoloAdquirente}) registrada para ${eventoId} e auditada.`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao registrar contestação de chargeback.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>Chargebacks e Contestações de Adquirente (<code>/chargebacks</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Monitoramento de contestações de cartão, dossiê de defesa junto à adquirente e retenção preventiva sobre o borderô do evento.
          </p>
        </div>
        <span className="bdg warn" style={{ margin: 0 }}>Total contestado: {formatBRL(totalContestado)}</span>
      </div>

      <form
        onSubmit={handleRegistrar}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', alignItems: 'end' }}
      >
        <label className="lb" style={{ fontSize: '12px' }}>
          Evento
          <select className="in tx" value={eventoId} onChange={e => setEventoId(e.target.value)}>
            {Object.entries(eventos).map(([id, ev]) => (
              <option key={id} value={id}>{String(ev.nome || id)}</option>
            ))}
            {Object.keys(eventos).length === 0 && <option value="polaquedo">polaquedo</option>}
          </select>
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Protocolo Adquirente
          <input className="in tx" value={protocoloAdquirente} onChange={e => setProtocoloAdquirente(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Valor Contestado (R$)
          <input className="in" type="number" step="10" min="0.01" value={valorContestado} onChange={e => setValorContestado(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Motivo / Razão da Contestação
          <input className="in tx" value={motivoContestacao} onChange={e => setMotivoContestacao(e.target.value)} required />
        </label>
        <button type="submit" className="btn" style={{ background: '#b91c1c', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
          Registrar Chargeback
        </button>
      </form>

      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}

      {lista.length === 0 ? (
        <p className="sub">Nenhum chargeback aberto em <code>/chargebacks</code>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>ID / Protocolo</th>
              <th style={{ padding: '8px' }}>Produtora / Evento</th>
              <th style={{ padding: '8px' }}>Status</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Valor Contestado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(([id, c]) => (
              <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px', fontWeight: 700 }}>{id}</td>
                <td style={{ padding: '8px' }}>{String(c.produtoraId || '')} · {String(c.eventoId || '')}</td>
                <td style={{ padding: '8px', fontWeight: 700 }}>{String(c.status || 'Em Análise')}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>
                  {formatBRL(Number(c.valor || 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'chargebacks',
  title: 'Chargebacks e Contestações',
  description: 'Gestão vertical de contestações de adquirentes e retenções preventivas no nó /chargebacks.',
  rtdbNode: 'chargebacks',
  requiresJavaService: false,
  render: (dados) => <ChargebacksInteractiveView dados={dados} />
};
