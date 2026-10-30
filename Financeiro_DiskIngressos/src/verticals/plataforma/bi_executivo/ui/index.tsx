import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../shared/modulePlugin';
import {
  chamarGerarSnapshotBiExecutivo,
  type EstadoFinanceiroRTDB
} from '../../../../shared/firebaseFinanceiro';
import { formatBRL } from '../../../../shared/formatters';

function BiExecutivoView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const snapshotsMap = (dados?.bi_executivo || {}) as Record<string, Record<string, unknown>>;
  const [chaveSnapshot, setChaveSnapshot] = useState('consolidado_atual');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const listaSnapshots = Object.entries(snapshotsMap);

  async function handleGerarSnapshot(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      const snap = await chamarGerarSnapshotBiExecutivo({ chaveSnapshot: chaveSnapshot.trim() || 'consolidado_atual' });
      setMsg(`Snapshot "${String((snap as Record<string, unknown>).id || chaveSnapshot)}" consolidado com sucesso.`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar snapshot DRE executivo.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>BI Executivo e DRE Gerencial (<code>/bi_executivo</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            GMV consolidado de bilheteria, Receita Bruta/Líquida Disk, Take Rate %, passivo circulante de produtoras e posição de tesouraria.
          </p>
        </div>
        <form onSubmit={handleGerarSnapshot} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            className="in tx"
            value={chaveSnapshot}
            onChange={e => setChaveSnapshot(e.target.value)}
            placeholder="consolidado_atual"
            style={{ width: '180px' }}
          />
          <button type="submit" className="btn" style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
            Gerar Snapshot DRE
          </button>
        </form>
      </div>

      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}

      {listaSnapshots.length === 0 ? (
        <p className="sub">Nenhum snapshot consolidado em <code>/bi_executivo</code>. Clique em &quot;Gerar Snapshot DRE&quot; para consolidar.</p>
      ) : (
        listaSnapshots.map(([id, s]) => {
          const dre = (s.dreDisk || {}) as Record<string, unknown>;
          const passivo = (s.passivoProdutoras || {}) as Record<string, unknown>;
          const tesouraria = (s.tesouraria || {}) as Record<string, unknown>;
          return (
            <div key={id} style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Snapshot: <code>{id}</code> ({String(s.geradoEm || '')})</strong>
                <code style={{ fontSize: '11px', color: '#475569' }}>
                  Selo SHA-256: {s.seloDreSha256 ? `${String(s.seloDreSha256).slice(0, 20)}…` : '—'}
                </code>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <div className="kpi">
                  <span>GMV Bilheteria Bruta</span>
                  <span className="num">{formatBRL(Number(s.gmvBilheteriaBruta || 0))}</span>
                </div>
                <div className="kpi">
                  <span>Receita Líquida Disk</span>
                  <span className="num" style={{ color: '#065f46' }}>{formatBRL(Number(dre.receitaLiquidaDisk || 0))}</span>
                  <span className="sub">Take Rate: {String(dre.takeRateLiquidoPct ?? 0)}%</span>
                </div>
                <div className="kpi">
                  <span>Passivo Retido / Liberável</span>
                  <span className="num" style={{ color: '#9a3412' }}>
                    {formatBRL(Number(passivo.retidoTotal || 0))} / {formatBRL(Number(passivo.liberavelTotal || 0))}
                  </span>
                </div>
                <div className="kpi">
                  <span>Contas a Receber / Pagar</span>
                  <span className="num">
                    {formatBRL(Number(tesouraria.contasReceberAberto || 0))} / {formatBRL(Number(tesouraria.contasPagarAberto || 0))}
                  </span>
                </div>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'bi_executivo',
  title: 'BI Executivo e DRE Gerencial',
  description: 'GMV consolidado, Take Rate líquido Disk, DRE de taxas e deduções, passivo retido/liberável e posição de tesouraria.',
  rtdbNode: 'bi_executivo',
  requiresJavaService: false,
  render: (dados) => <BiExecutivoView dados={dados} />
};
