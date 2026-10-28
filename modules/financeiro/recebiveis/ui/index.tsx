import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';
import {
  chamarCallableFinanceiro,
  type EstadoFinanceiroRTDB
} from '../../../../apps/financeiro/src/shared/firebaseFinanceiro';
import { formatBRL } from '../../../../apps/financeiro/src/shared/formatters';

function RecebiveisAdquirenteView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const agendaMap = (dados?.recebiveis_agenda || {}) as Record<string, Record<string, unknown>>;
  const [tituloReceberId, setTituloReceberId] = useState('');
  const [taxaMdrPct, setTaxaMdrPct] = useState('2.49');
  const [protocoloAdquirente, setProtocoloAdquirente] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = Object.entries(agendaMap);

  async function handleLiquidar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      await chamarCallableFinanceiro('liquidarAgendaAdquirente', {
        tituloReceberId: tituloReceberId.trim(),
        taxaMdrPct: Number(taxaMdrPct),
        protocoloAdquirente: protocoloAdquirente.trim()
      });
      setMsg(`Agenda do título ${tituloReceberId} liquidada e contabilizada no Ledger.`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao liquidar agenda de adquirente.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 className="h2" style={{ margin: 0 }}>Recebíveis de Gateway e Adquirente (<code>/recebiveis_agenda</code>)</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Liquidação de agendas de cartão/PIX com cálculo de MDR, baixa em <code>/contas_receber</code> e partida dobrada no Ledger.
        </p>
      </div>
      <form onSubmit={handleLiquidar} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', alignItems: 'end' }}>
        <label className="lb" style={{ fontSize: '12px' }}>
          Título Contas a Receber ID
          <input className="in tx" value={tituloReceberId} onChange={e => setTituloReceberId(e.target.value)} placeholder="cr_vnd_lote_01" required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Taxa MDR (%)
          <input className="in tx" type="number" step="0.01" min="0" value={taxaMdrPct} onChange={e => setTaxaMdrPct(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Protocolo Adquirente
          <input className="in tx" value={protocoloAdquirente} onChange={e => setProtocoloAdquirente(e.target.value)} placeholder="STONE-LIQ-001" required />
        </label>
        <button type="submit" className="btn" style={{ background: '#047857', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
          Liquidar Recebível
        </button>
      </form>
      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}
      {lista.length === 0 ? (
        <p className="sub">Nenhuma agenda liquidada em <code>/recebiveis_agenda</code>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>Agenda / Título</th>
              <th style={{ padding: '8px' }}>Protocolo</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Valor Bruto</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>MDR Retido</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Valor Líquido</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(([id, a]) => (
              <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px', fontWeight: 700 }}>{id}</td>
                <td style={{ padding: '8px' }}>{String(a.protocoloAdquirente || '')}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(a.valorBruto || 0))}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#b91c1c' }}>{formatBRL(Number(a.totalDescontosGateway || 0))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#065f46' }}>{formatBRL(Number(a.valorLiquido || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'recebiveis',
  title: 'Recebíveis de Gateway e Adquirente',
  description: 'Agenda de liquidação de cartões/PIX, retenção de MDR/antecipação e baixa contábil em Contas a Receber e Ledger.',
  rtdbNode: 'recebiveis_agenda',
  requiresJavaService: false,
  render: (dados) => <RecebiveisAdquirenteView dados={dados} />
};
