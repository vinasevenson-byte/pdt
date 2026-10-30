import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';
import {
  chamarCallableFinanceiro,
  type EstadoFinanceiroRTDB
} from '../../../../apps/financeiro/src/shared/firebaseFinanceiro';
import { formatBRL } from '../../../../apps/financeiro/src/shared/formatters';

const EXEMPLO_OFX = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>341</BANKID><ACCTID>12345-6</ACCTID></BANKACCTFROM><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261005120000</DTPOSTED><TRNAMT>-5000.00</TRNAMT><FITID>TED-ITAU-20261005-994812</FITID><MEMO>REPASSE PRODUTOR</MEMO></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></OFX>`;

function ConciliacaoOFXInteractiveView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const mapa = dados?.conciliacoes || {};
  const [competencia, setCompetencia] = useState('2026-10');
  const [ofxConteudo, setOfxConteudo] = useState(EXEMPLO_OFX);
  const [conciliacaoIdVinc, setConciliacaoIdVinc] = useState('');
  const [extratoIdVinc, setExtratoIdVinc] = useState('');
  const [lancamentoIdVinc, setLancamentoIdVinc] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = Object.entries(mapa);

  async function handleImportarOFX(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      const res = await chamarCallableFinanceiro('importarExtratoOFX', {
        competencia: competencia.trim(),
        ofxConteudo
      });
      setMsg(`✓ Extrato OFX importado e conciliado (${String(res.id || 'lote')}) com selo anti-duplicidade SHA-256.`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar extrato OFX.');
    }
  }

  async function handleVincularManual(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      await chamarCallableFinanceiro('vincularItemConciliacao', {
        conciliacaoId: conciliacaoIdVinc.trim(),
        extratoId: extratoIdVinc.trim(),
        lancamentoId: lancamentoIdVinc.trim(),
        justificativa: 'Pareamento manual realizado no Painel Financeiro'
      });
      setMsg(`✓ Item OFX ${extratoIdVinc} vinculado manualmente ao lançamento ${lancamentoIdVinc}.`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao vincular item de conciliação.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 className="h2" style={{ margin: 0 }}>Conciliação Bancária OFX (<code>/conciliacoes</code>)</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Parser OFX 1.02 (SGML) / 2.x (XML) com bloqueio de duplicidade por hash SHA-256, pareamento por protocolo/data+valor e vínculo manual auditado.
        </p>
      </div>

      <form onSubmit={handleImportarOFX} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', alignItems: 'end' }}>
          <label className="lb" style={{ fontSize: '12px' }}>
            Competência Alvo (YYYY-MM)
            <input className="in tx" value={competencia} onChange={e => setCompetencia(e.target.value)} required />
          </label>
          <button type="submit" className="btn" style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
            📥 Importar e Conciliar Extrato OFX
          </button>
        </div>
        <label className="lb" style={{ fontSize: '12px' }}>
          Conteúdo do Extrato OFX (1.02 SGML ou 2.x XML)
          <textarea
            className="in tx"
            rows={3}
            style={{ fontFamily: 'monospace', fontSize: '12px' }}
            value={ofxConteudo}
            onChange={e => setOfxConteudo(e.target.value)}
            required
          />
        </label>
      </form>

      <form
        onSubmit={handleVincularManual}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', alignItems: 'end', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}
      >
        <label className="lb" style={{ fontSize: '12px' }}>
          Conciliação ID
          <input className="in tx" value={conciliacaoIdVinc} onChange={e => setConciliacaoIdVinc(e.target.value)} placeholder="conc_..." required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          FITID / Extrato ID
          <input className="in tx" value={extratoIdVinc} onChange={e => setExtratoIdVinc(e.target.value)} placeholder="TED-ITAU-..." required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Lançamento Ledger ID
          <input className="in tx" value={lancamentoIdVinc} onChange={e => setLancamentoIdVinc(e.target.value)} placeholder="lnc_..." required />
        </label>
        <button type="submit" className="btn" style={{ background: '#047857', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
          🔗 Vincular Item Manualmente
        </button>
      </form>

      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}

      {lista.length === 0 ? (
        <p className="sub">Nenhum extrato OFX importado em <code>/conciliacoes</code>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>ID / Competência</th>
              <th style={{ padding: '8px' }}>Status</th>
              <th style={{ padding: '8px' }}>Hash SHA-256</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Soma Extrato</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Soma Ledger</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(([id, c]) => {
              const res = (c.resumo || {}) as Record<string, unknown>;
              return (
                <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{id} ({String(c.competencia || '')})</td>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{String(c.status || '')}</td>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                    {c.hashArquivo ? `${String(c.hashArquivo).slice(0, 14)}…` : '—'}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(res.somaExtrato || 0))}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(res.somaLedger || 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'conciliacao',
  title: 'Conciliação OFX',
  description: 'Importação de extratos OFX 1.02/2.x e conciliação determinística contra o Ledger (/conciliacoes).',
  rtdbNode: 'conciliacoes',
  requiresJavaService: true,
  render: (dados) => <ConciliacaoOFXInteractiveView dados={dados} />
};
