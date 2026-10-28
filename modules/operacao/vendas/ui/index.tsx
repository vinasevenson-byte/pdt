import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';
import {
  chamarCallableFinanceiro,
  type EstadoFinanceiroRTDB
} from '../../../../apps/financeiro/src/shared/firebaseFinanceiro';
import { formatBRL } from '../../../../apps/financeiro/src/shared/formatters';

function OperacaoVendasView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const lotesMap = (dados?.vendas_lotes || {}) as Record<string, Record<string, unknown>>;
  const [eventoId, setEventoId] = useState('polaquedo');
  const [loteId, setLoteId] = useState('lote_01');
  const [nomeLote, setNomeLote] = useState('1º Lote Inteira');
  const [setor, setSetor] = useState('Pista');
  const [qtdVendida, setQtdVendida] = useState('10');
  const [qtdCortesias, setQtdCortesias] = useState('0');
  const [valorBruto, setValorBruto] = useState('1000');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = Object.entries(lotesMap);

  async function handleRegistrarLote(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      await chamarCallableFinanceiro('registrarLoteVendasBordero', {
        loteId: loteId.trim(),
        eventoId: eventoId.trim(),
        nomeLote: nomeLote.trim(),
        setor: setor.trim(),
        quantidadeVendida: Number(qtdVendida),
        quantidadeCortesias: Number(qtdCortesias),
        valorBruto: Number(valorBruto),
        meioPagamento: 'PIX'
      });
      setMsg(`Lote ${loteId} registrado e borderô recalculado.`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao ingerir lote de vendas.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 className="h2" style={{ margin: 0 }}>Operação de Vendas, Lotes e Cortesias (<code>/vendas_lotes</code>)</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Ingestão idempotente de borderôs de venda com trava de capacidade por setor/evento e recálculo imediato de saldos.
        </p>
      </div>
      <form onSubmit={handleRegistrarLote} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', alignItems: 'end' }}>
        <label className="lb" style={{ fontSize: '12px' }}>
          Lote ID
          <input className="in tx" value={loteId} onChange={e => setLoteId(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Evento ID
          <input className="in tx" value={eventoId} onChange={e => setEventoId(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Nome do Lote
          <input className="in tx" value={nomeLote} onChange={e => setNomeLote(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Setor
          <input className="in tx" value={setor} onChange={e => setSetor(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Qtd Vendida
          <input className="in tx" type="number" min="0" value={qtdVendida} onChange={e => setQtdVendida(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Cortesias
          <input className="in tx" type="number" min="0" value={qtdCortesias} onChange={e => setQtdCortesias(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Valor Bruto (R$)
          <input className="in tx" type="number" step="0.01" min="0" value={valorBruto} onChange={e => setValorBruto(e.target.value)} required />
        </label>
        <button type="submit" className="btn" style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
          Registrar Lote
        </button>
      </form>
      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}
      {lista.length === 0 ? (
        <p className="sub">Nenhum lote registrado em <code>/vendas_lotes</code>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>Lote / Evento</th>
              <th style={{ padding: '8px' }}>Setor</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Vendidos / Cortesias</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Valor Bruto</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(([id, l]) => (
              <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px', fontWeight: 700 }}>{id} ({String(l.eventoId || '')})</td>
                <td style={{ padding: '8px' }}>{String(l.setor || '')}</td>
                <td style={{ padding: '8px', textAlign: 'right' }}>{String(l.quantidadeVendida || 0)} / {String(l.quantidadeCortesias || 0)}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(l.valorBruto || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'vendas',
  title: 'Operação de Vendas, Lotes e Cortesias',
  description: 'Ingestão idempotente de borderôs de venda e cortesias com trava de capacidade e atualização imediata de saldos.',
  rtdbNode: 'vendas_lotes',
  requiresJavaService: false,
  render: (dados) => <OperacaoVendasView dados={dados} />
};
