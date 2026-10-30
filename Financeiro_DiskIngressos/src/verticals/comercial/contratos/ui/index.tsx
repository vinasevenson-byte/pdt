import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../shared/modulePlugin';
import {
  chamarCallableFinanceiro,
  type EstadoFinanceiroRTDB
} from '../../../../shared/firebaseFinanceiro';

function ContratosNegociacaoView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const contratosMap = (dados?.contratos || {}) as Record<string, Record<string, unknown>>;
  const eventos = dados?.eventos || {};
  const [eventoId, setEventoId] = useState(Object.keys(eventos)[0] || 'polaquedo');
  const [numeroContrato, setNumeroContrato] = useState('CTR-2026-001');
  const [taxaAdmPct, setTaxaAdmPct] = useState('10');
  const [taxaOpReais, setTaxaOpReais] = useState('2.50');
  const [motivoAditivo, setMotivoAditivo] = useState('Publicação de termos comerciais');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = Object.entries(contratosMap);

  async function handlePublicar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      const res = await chamarCallableFinanceiro('publicarVersaoContratoNegociacao', {
        eventoId: eventoId.trim(),
        numeroContrato: numeroContrato.trim(),
        motivoAditivo: motivoAditivo.trim(),
        negociacao: {
          taxaAdmPct: Number(taxaAdmPct),
          taxaOpPorIngresso: Number(taxaOpReais)
        }
      });
      setMsg(`Contrato v${String(res.versao || 1)} publicado com selo SHA-256.`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao publicar versão de contrato.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 className="h2" style={{ margin: 0 }}>Contratos, Negociações e Aditivos Versionados (<code>/contratos</code>)</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Versionamento v1/v2 com selo SHA-256, validação de faixas crescentes de liberação e projeção limpa para o produtor.
        </p>
      </div>
      <form onSubmit={handlePublicar} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'end' }}>
        <label className="lb" style={{ fontSize: '12px' }}>
          Evento ID
          <input className="in tx" value={eventoId} onChange={e => setEventoId(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Nº Contrato
          <input className="in tx" value={numeroContrato} onChange={e => setNumeroContrato(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Taxa Adm (%)
          <input className="in tx" type="number" step="0.1" value={taxaAdmPct} onChange={e => setTaxaAdmPct(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Taxa Op / Ingresso (R$)
          <input className="in tx" type="number" step="0.01" value={taxaOpReais} onChange={e => setTaxaOpReais(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Motivo / Justificativa
          <input className="in tx" value={motivoAditivo} onChange={e => setMotivoAditivo(e.target.value)} required />
        </label>
        <button type="submit" className="btn" style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
          Publicar Contrato / Aditivo
        </button>
      </form>
      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}
      {lista.length === 0 ? (
        <p className="sub">Nenhum contrato versionado em <code>/contratos</code>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>Evento</th>
              <th style={{ padding: '8px' }}>Nº Contrato</th>
              <th style={{ padding: '8px' }}>Versão</th>
              <th style={{ padding: '8px' }}>Selo SHA-256</th>
              <th style={{ padding: '8px' }}>Atualizado Em</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(([evId, c]) => (
              <tr key={evId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px', fontWeight: 700 }}>{evId}</td>
                <td style={{ padding: '8px' }}>{String(c.numeroContrato || '')}</td>
                <td style={{ padding: '8px', fontWeight: 700 }}>v{String(c.versaoAtual || 1)}</td>
                <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                  {c.hashTermosSha256 ? `${String(c.hashTermosSha256).slice(0, 16)}…` : '—'}
                </td>
                <td style={{ padding: '8px' }}>{String(c.atualizadoEm || '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'contratos',
  title: 'Contratos e Aditivos Comerciais',
  description: 'Termos contratuais versionados por evento (/contratos) e projeção limpa para o produtor (/contratos_produtor).',
  rtdbNode: 'contratos',
  requiresJavaService: false,
  render: (dados) => <ContratosNegociacaoView dados={dados} />
};
