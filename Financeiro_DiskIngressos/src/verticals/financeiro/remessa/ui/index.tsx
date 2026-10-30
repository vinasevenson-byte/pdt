import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../shared/modulePlugin';
import {
  chamarCallableFinanceiro,
  type EstadoFinanceiroRTDB
} from '../../../../shared/firebaseFinanceiro';
import { formatBRL } from '../../../../shared/formatters';

function RemessaCNABInteractiveView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const mapa = dados?.remessas || {};
  const [codigoBanco, setCodigoBanco] = useState('341');
  const [remessaRetornoId, setRemessaRetornoId] = useState('');
  const [tituloRetornoId, setTituloRetornoId] = useState('');
  const [ocorrenciaRetorno, setOcorrenciaRetorno] = useState('00');
  const [protocoloRetorno, setProtocoloRetorno] = useState('PIX-CNAB-2026-001');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = Object.entries(mapa);

  async function handleGerarRemessa(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      const res = await chamarCallableFinanceiro('gerarRemessaPagamento', {
        codigoBanco: codigoBanco.trim()
      });
      setMsg(`✓ Lote CNAB 240 / PIX ${String(res.id || '')} gerado para títulos aprovados!`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar remessa de pagamento.');
    }
  }

  async function handleProcessarRetorno(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      await chamarCallableFinanceiro('processarRetornoRemessa', {
        remessaId: remessaRetornoId.trim(),
        retornoEntrada: [
          {
            tituloId: tituloRetornoId.trim(),
            codigoOcorrencia: ocorrenciaRetorno,
            protocoloBancario: protocoloRetorno.trim()
          }
        ]
      });
      setMsg(`✓ Retorno bancário da remessa ${remessaRetornoId} processado (ocorrência "${ocorrenciaRetorno}").`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao processar retorno bancário.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 className="h2" style={{ margin: 0 }}>Remessa Bancária PIX / CNAB 240 (<code>/remessas</code>)</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Geração de lotes Febraban 240 posições para títulos aprovados em <code>/contas_pagar</code> e baixa automática com partida dobrada via retorno bancário (&quot;00&quot; vs &quot;RJ&quot;).
        </p>
      </div>

      <form
        onSubmit={handleGerarRemessa}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'end' }}
      >
        <label className="lb" style={{ fontSize: '12px' }}>
          Banco Compensador (FEBRABAN)
          <select className="in tx" value={codigoBanco} onChange={e => setCodigoBanco(e.target.value)}>
            <option value="341">341 · Itaú Unibanco</option>
            <option value="033">033 · Santander</option>
            <option value="237">237 · Bradesco</option>
            <option value="001">001 · Banco do Brasil</option>
          </select>
        </label>
        <button type="submit" className="btn" style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
          📤 Gerar Lote CNAB 240 / PIX (Títulos Aprovados)
        </button>
      </form>

      <form
        onSubmit={handleProcessarRetorno}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'end', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}
      >
        <label className="lb" style={{ fontSize: '12px' }}>
          Remessa ID
          <input className="in tx" value={remessaRetornoId} onChange={e => setRemessaRetornoId(e.target.value)} placeholder="rem_..." required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Título Contas a Pagar ID
          <input className="in tx" value={tituloRetornoId} onChange={e => setTituloRetornoId(e.target.value)} placeholder="cp_rep_..." required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Ocorrência Retorno
          <select className="in tx" value={ocorrenciaRetorno} onChange={e => setOcorrenciaRetorno(e.target.value)}>
            <option value="00">00 · Crédito / Pagamento Efetuado</option>
            <option value="RJ">RJ · Rejeitado pelo Banco (Libera Título)</option>
          </select>
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Protocolo Bancário
          <input className="in tx" value={protocoloRetorno} onChange={e => setProtocoloRetorno(e.target.value)} required />
        </label>
        <button type="submit" className="btn" style={{ background: '#047857', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
          📥 Processar Retorno Bancário
        </button>
      </form>

      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}

      {lista.length === 0 ? (
        <p className="sub">Nenhuma remessa bancária gerada em <code>/remessas</code>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>ID / Sequencial</th>
              <th style={{ padding: '8px' }}>Banco / Data</th>
              <th style={{ padding: '8px' }}>Qtd. Títulos</th>
              <th style={{ padding: '8px' }}>Status</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Valor Total</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(([id, r]) => (
              <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px', fontWeight: 700 }}>{id} (#{String(r.numeroSequencial || 1)})</td>
                <td style={{ padding: '8px' }}>{String(r.codigoBanco || '341')} · {String(r.dataGeracao || '')}</td>
                <td style={{ padding: '8px' }}>{String(r.quantidadeItens || 0)}</td>
                <td style={{ padding: '8px', fontWeight: 700 }}>{String(r.status || '')}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(r.valorTotal || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'remessa',
  title: 'Remessa PIX / CNAB 240',
  description: 'Lotes de pagamento CNAB 240 / PIX a partir de contas a pagar aprovadas e baixa por retorno (/remessas).',
  rtdbNode: 'remessas',
  requiresJavaService: false,
  render: (dados) => <RemessaCNABInteractiveView dados={dados} />
};
