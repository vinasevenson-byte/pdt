import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';
import {
  chamarCallableFinanceiro,
  type EstadoFinanceiroRTDB
} from '../../../../apps/financeiro/src/shared/firebaseFinanceiro';
import { formatBRL } from '../../../../apps/financeiro/src/shared/formatters';

function FiscalRetencoesInteractiveView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const mapa = dados?.apuracoes_fiscais || {};
  const [competencia, setCompetencia] = useState('2026-10');
  const [protocoloGuia, setProtocoloGuia] = useState('DARF-ISS-202610-001');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = Object.entries(mapa);

  async function handleApurar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      await chamarCallableFinanceiro('apurarImpostosCompetencia', {
        competencia: competencia.trim()
      });
      setMsg(`✓ Apuração fiscal e retenções da competência ${competencia} calculadas e provisionadas em Contas a Pagar!`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao apurar impostos da competência.');
    }
  }

  async function handleRecolherGuia(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      await chamarCallableFinanceiro('recolherGuiaFiscal', {
        competencia: competencia.trim(),
        protocoloGuia: protocoloGuia.trim()
      });
      setMsg(`✓ Guias fiscais da competência ${competencia} recolhidas (${protocoloGuia}) e contabilizadas no Ledger!`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao recolher guia fiscal.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 className="h2" style={{ margin: 0 }}>Apuração Fiscal &amp; Retenções a Recolher (<code>/apuracoes_fiscais</code>)</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Cálculo mensal de tributos sobre receitas Disk (ISS, PIS, COFINS, IRPJ, CSLL) e retenções de eventos (ISS/ECAD) integrado a <code>/contas_pagar</code> e <code>/lancamentos</code>.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        <form onSubmit={handleApurar} style={{ display: 'flex', gap: '8px', alignItems: 'end' }}>
          <label className="lb" style={{ fontSize: '12px', flex: 1 }}>
            Competência (YYYY-MM)
            <input className="in tx" value={competencia} onChange={e => setCompetencia(e.target.value)} required />
          </label>
          <button type="submit" className="btn" style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
            🧮 Apurar Competência
          </button>
        </form>

        <form onSubmit={handleRecolherGuia} style={{ display: 'flex', gap: '8px', alignItems: 'end' }}>
          <label className="lb" style={{ fontSize: '12px', flex: 1 }}>
            Protocolo DARF / DAM / ECAD
            <input className="in tx" value={protocoloGuia} onChange={e => setProtocoloGuia(e.target.value)} required />
          </label>
          <button type="submit" className="btn" style={{ background: '#047857', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
            🏛️ Recolher Guia Fiscal
          </button>
        </form>
      </div>

      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}

      {lista.length === 0 ? (
        <p className="sub">Nenhuma apuração fiscal registrada em <code>/apuracoes_fiscais</code>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>Competência</th>
              <th style={{ padding: '8px' }}>Status</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Base Tributável Disk</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Tributos Próprios</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Retenções Eventos</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Total Guias</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(([comp, ap]) => {
              const trib = (ap.tributosProprios || {}) as Record<string, unknown>;
              const ret = (ap.retencoesTerceiros || {}) as Record<string, unknown>;
              return (
                <tr key={comp} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{comp}</td>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{String(ap.status || '')}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(ap.baseTributavelDisk || 0))}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(trib.total || 0))}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(ret.saldoARecolher || 0))}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(ap.totalGuiasARecolher || 0))}</td>
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
  id: 'fiscal',
  title: 'Apuração Fiscal & Retenções',
  description: 'Apuração mensal de ISS, PIS, COFINS, IRPJ, CSLL e retenções de eventos (ISS/ECAD) por competência (/apuracoes_fiscais).',
  rtdbNode: 'apuracoes_fiscais',
  requiresJavaService: false,
  render: (dados) => <FiscalRetencoesInteractiveView dados={dados} />
};
