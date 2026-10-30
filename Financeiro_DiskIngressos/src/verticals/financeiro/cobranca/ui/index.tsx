import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../shared/modulePlugin';
import {
  chamarCallableFinanceiro,
  type EstadoFinanceiroRTDB
} from '../../../../shared/firebaseFinanceiro';
import { formatBRL } from '../../../../shared/formatters';

function CobrancaDevedoresView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const cobrancasMap = (dados?.cobrancas_devedores || {}) as Record<string, Record<string, unknown>>;
  const [produtoraId, setProdutoraId] = useState('prod_demo');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = Object.entries(cobrancasMap);

  async function handleApurar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      await chamarCallableFinanceiro('apurarCobrancaProdutora', { produtoraId: produtoraId.trim() });
      setMsg(`Posição devedora apurada para ${produtoraId}.`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao apurar cobrança da produtora.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>Cobrança, Inadimplência e Devedores (<code>/cobrancas_devedores</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Apuração de eventos deficitários, compensação automática entre eventos superavitários e geração de título de recomposição.
          </p>
        </div>
        <form onSubmit={handleApurar} style={{ display: 'flex', gap: '8px' }}>
          <input className="in tx" value={produtoraId} onChange={e => setProdutoraId(e.target.value)} placeholder="prod_demo" required />
          <button type="submit" className="btn" style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
            Apurar Produtora
          </button>
        </form>
      </div>
      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}
      {lista.length === 0 ? (
        <p className="sub">Nenhuma apuração registrada em <code>/cobrancas_devedores</code>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>Produtora</th>
              <th style={{ padding: '8px' }}>Status</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Devedor Bruto</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Compensado</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Dívida Residual</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(([pid, c]) => (
              <tr key={pid} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px', fontWeight: 700 }}>{pid}</td>
                <td style={{ padding: '8px', fontWeight: 700 }}>{String(c.status || '')}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(c.totalDevedorBruto || 0))}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#065f46' }}>{formatBRL(Number(c.compensadoEntreEventos || 0))}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#b91c1c' }}>{formatBRL(Number(c.dividaResidual || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'cobranca',
  title: 'Cobrança, Inadimplência e Devedores',
  description: 'Gestão de eventos deficitários, compensação automática entre eventos da mesma produtora e títulos de recomposição de saldo.',
  rtdbNode: 'cobrancas_devedores',
  requiresJavaService: false,
  render: (dados) => <CobrancaDevedoresView dados={dados} />
};
