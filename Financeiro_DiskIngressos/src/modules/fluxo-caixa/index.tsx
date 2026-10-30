import { useState } from 'react';
import type { FinancialModulePlugin, ModuloNavegacaoProps } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import {
  recalcularFluxoCaixaRTDB,
  type EstadoFinanceiroRTDB
} from '../../shared/firebaseFinanceiro';

function FluxoCaixaInteractiveView({
  dados,
  nav
}: {
  dados?: EstadoFinanceiroRTDB;
  nav?: ModuloNavegacaoProps;
}) {
  const fc = (dados?.fluxoCaixa || {}) as Record<string, unknown>;
  const janelas = (fc.janelas || {}) as Record<string, Record<string, unknown>>;
  const serieDiaria = Array.isArray(fc.serieDiaria)
    ? (fc.serieDiaria as Array<Record<string, unknown>>)
    : [];

  const [saldoInicialInput, setSaldoInicialInput] = useState<string>(String(fc.saldoInicial ?? 50000));
  const [dataRefInput, setDataRefInput] = useState<string>(String(fc.dataReferencia || '15/10/2026'));
  const [recalculando, setRecalculando] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function handleRecalcular(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    setRecalculando(true);
    try {
      await recalcularFluxoCaixaRTDB({
        saldoInicialBancario: Number(saldoInicialInput || 0),
        dataBase: dataRefInput.trim() || '15/10/2026'
      });
      setMsg('✓ Projeção de Fluxo de Caixa (30 / 60 / 90 dias) recalculada em centavos inteiros!');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao recalcular fluxo de caixa.');
    } finally {
      setRecalculando(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section className="card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>📈 Fluxo de Caixa Projetado × Realizado (<code>/fluxo_caixa</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Projeção diária e acumulada em janelas de 30, 60 e 90 dias integrando Contas a Receber, Contas a Pagar e calendário bancário FEBRABAN (D+X).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {nav && (
            <>
              <button
                type="button"
                className="btn"
                style={{ background: '#eef2ff', color: '#1e3a8a', minHeight: '38px', fontSize: '13px' }}
                onClick={() => nav.navegarPara('contas_receber')}
              >
                💰 Contas a Receber →
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#f8fafc', color: '#0f1b3d', border: '1px solid #cbd5e1', minHeight: '38px', fontSize: '13px' }}
                onClick={() => nav.navegarPara('contas_pagar')}
              >
                📑 Contas a Pagar →
              </button>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <form
          onSubmit={handleRecalcular}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'end' }}
        >
          <label className="lb" style={{ fontSize: '12px' }}>
            Saldo Inicial Bancário Disk (R$)
            <input
              className="in"
              type="number"
              step="500"
              value={saldoInicialInput}
              onChange={e => setSaldoInicialInput(e.target.value)}
              required
            />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Data Base de Referência (FEBRABAN)
            <input
              className="in tx"
              value={dataRefInput}
              onChange={e => setDataRefInput(e.target.value)}
              placeholder="DD/MM/AAAA"
              required
            />
          </label>
          <button
            type="submit"
            className="btn"
            style={{ background: '#1e3a8a', color: '#fff', minHeight: '40px', fontSize: '13px' }}
            disabled={recalculando}
          >
            {recalculando ? 'Recalculando...' : '🔄 Recalcular Projeção (30 / 60 / 90d)'}
          </button>
        </form>
        {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700, marginTop: '10px' }}>{msg}</div>}
        {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700, marginTop: '10px' }}>{erro}</div>}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
        {(['d30', 'd60', 'd90'] as const).map(k => {
          const j = janelas[k] || {};
          const saldoProj = Number(j.saldoProjetadoFinal ?? j.saldoProjetado ?? 0);
          const entProj = Number(j.entradasProjetadas || 0);
          const saiProj = Number(j.saidasProjetadas || 0);
          const entReal = Number(j.entradasRealizadas || 0);
          const saiReal = Number(j.saidasRealizadas || 0);
          return (
            <section key={k} className="card" style={{ border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#1e3a8a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Janela {k.replace('d', '')} Dias Úteis
                </span>
                <span className="bdg" style={{ margin: 0 }}>Horizonte {k.toUpperCase()}</span>
              </div>
              <div className="num" style={{ fontSize: '22px', fontWeight: 800, color: saldoProj >= 0 ? '#065f46' : '#b91c1c' }}>
                {formatBRL(saldoProj)}
              </div>
              <div className="sub" style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #eef1f7', paddingTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(+) Entradas Realizadas / Proj.:</span>
                  <strong className="num" style={{ color: '#065f46' }}>{formatBRL(entReal + entProj)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(−) Saídas Realizadas / Proj.:</span>
                  <strong className="num" style={{ color: '#9a3412' }}>{formatBRL(saiReal + saiProj)}</strong>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section className="card">
        <h3 className="h2" style={{ fontSize: '16px', marginBottom: '10px' }}>
          Série Diária Projetada × Realizada (Saldo Inicial: {formatBRL(Number(fc.saldoInicial ?? saldoInicialInput ?? 0))})
        </h3>
        {serieDiaria.length === 0 ? (
          <p className="sub">Nenhuma movimentação diária projetada para os títulos atuais.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '8px' }}>Data Efetiva (D+X)</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Entradas Real.</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Entradas Proj.</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Saídas Real.</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Saídas Proj.</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Saldo Acum. Realizado</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Saldo Acum. Projetado</th>
                </tr>
              </thead>
              <tbody>
                {serieDiaria.map((d, idx) => (
                  <tr key={`${String(d.data || idx)}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px', fontWeight: 800 }}>{String(d.data || '—')}</td>
                    <td className="num" style={{ padding: '8px', textAlign: 'right', color: '#065f46' }}>{formatBRL(Number(d.entradasRealizadas || 0))}</td>
                    <td className="num" style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(d.entradasProjetadas || 0))}</td>
                    <td className="num" style={{ padding: '8px', textAlign: 'right', color: '#b91c1c' }}>{formatBRL(Number(d.saidasRealizadas || 0))}</td>
                    <td className="num" style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(d.saidasProjetadas || 0))}</td>
                    <td className="num" style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(d.saldoAcumuladoRealizado || 0))}</td>
                    <td className="num" style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>{formatBRL(Number(d.saldoAcumuladoProjetado || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export const fluxoCaixaModule: FinancialModulePlugin = {
  id: 'fluxo_caixa',
  title: 'Fluxo de Caixa',
  description: 'Projetado x Realizado por data útil bancária (D+X) com janelas acumuladas de 30, 60 e 90 dias.',
  rtdbNode: 'fluxo_caixa',
  requiresJavaService: true,
  render: (dados, _sessao, nav) => <FluxoCaixaInteractiveView dados={dados} nav={nav} />
};
