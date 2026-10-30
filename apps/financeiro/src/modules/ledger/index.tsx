import { useState } from 'react';
import type { FinancialModulePlugin, ModuloNavegacaoProps } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import {
  chamarEstornarLancamento,
  type EstadoFinanceiroRTDB
} from '../../shared/firebaseFinanceiro';

const CATALOGO_PLANO_CONTAS = [
  { codigo: '1.1.01.02', nome: 'Conta Movimento Bancária Disk', natureza: 'Ativo / Caixa' },
  { codigo: '1.1.02.01', nome: 'Créditos de Bilheteria a Receber (Adquirentes)', natureza: 'Ativo Circulante' },
  { codigo: '1.1.03.01', nome: 'Adiantamentos a Produtores (Advanced / Antecipação)', natureza: 'Ativo Circulante' },
  { codigo: '2.1.01.01', nome: 'Obrigações de Repasse Produtor', natureza: 'Passivo Circulante' },
  { codigo: '2.1.02.01', nome: 'Fornecedores e Despesas de Eventos a Pagar', natureza: 'Passivo Circulante' },
  { codigo: '2.1.03.01', nome: 'Retenções Fiscais e Direitos Autorais a Recolher (ISS/ECAD)', natureza: 'Passivo Fiscal' },
  { codigo: '3.1.01.01', nome: 'Receita de Taxa Administrativa Disk', natureza: 'Receita Operacional' },
  { codigo: '3.1.01.02', nome: 'Receita de Taxa Operacional e Spread', natureza: 'Receita Operacional' },
  { codigo: '3.1.01.03', nome: 'Receita de Tarifa de Transferência (TED)', natureza: 'Receita Financeira' },
  { codigo: '4.1.01.01', nome: 'Despesa de MDR / Taxas de Adquirente', natureza: 'Despesa Financeira' }
];

function LedgerInteractiveView({
  dados,
  nav
}: {
  dados?: EstadoFinanceiroRTDB;
  nav?: ModuloNavegacaoProps;
}) {
  const lancsRaw = dados?.lancamentos || {};
  const fechsRaw = dados?.fechamentos || {};

  const [filtroCompetencia, setFiltroCompetencia] = useState<string>('Todas');
  const [busca, setBusca] = useState<string>('');
  const [exibirPlanoContas, setExibirPlanoContas] = useState<boolean>(false);

  // Modal / Painel de Estorno Contábil
  const [estornoAlvoId, setEstornoAlvoId] = useState<string | null>(null);
  const [motivoEstorno, setMotivoEstorno] = useState<string>('');
  const [dataEstorno, setDataEstorno] = useState<string>('2026-10-29');
  const [processando, setProcessando] = useState<boolean>(false);
  const [msgSucesso, setMsgSucesso] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  const lancs = Object.entries(lancsRaw).map(([id, l]): Record<string, unknown> & { id: string } => ({
    ...(l as Record<string, unknown>),
    id
  }));
  const fechs = Object.entries(fechsRaw).map(([comp, f]): Record<string, unknown> & { comp: string } => ({
    ...(f as Record<string, unknown>),
    comp
  }));

  const competenciasSet = Array.from(
    new Set(lancs.map(l => String(l.competencia || '')).filter(Boolean))
  ).sort();

  const totMovimentado = lancs.reduce((s, l) => s + Number(l.valor || 0), 0);
  const qtdEstornos = lancs.filter(l => Boolean(l.estornoDeLancamentoId || String(l.origemModulo || '').toLowerCase().includes('estorno'))).length;

  const buscaNorm = busca.trim().toLowerCase();
  const lancsFiltrados = lancs.filter(l => {
    if (filtroCompetencia !== 'Todas' && String(l.competencia || '') !== filtroCompetencia) return false;
    if (buscaNorm) {
      const txt = `${l.id} ${l.contaDebito || ''} ${l.contaCredito || ''} ${l.historico || ''} ${l.eventoId || ''} ${l.origemModulo || ''}`.toLowerCase();
      if (!txt.includes(buscaNorm)) return false;
    }
    return true;
  });

  async function handleConfirmarEstorno(e: React.FormEvent) {
    e.preventDefault();
    if (!estornoAlvoId || !motivoEstorno.trim()) return;
    setErroMsg(null);
    setMsgSucesso(null);
    setProcessando(true);
    try {
      const res = await chamarEstornarLancamento({
        lancamentoId: estornoAlvoId,
        motivo: motivoEstorno.trim(),
        dataEstorno
      });
      const est = (res as Record<string, unknown>).lancamentoEstorno as Record<string, unknown> | undefined;
      setMsgSucesso(`✓ Estorno contábil imutável gerado (${String(est?.id || 'novo lançamento inverso')}) preservando a integridade do Razão!`);
      setEstornoAlvoId(null);
      setMotivoEstorno('');
    } catch (err) {
      setErroMsg(err instanceof Error ? err.message : 'Erro ao estornar lançamento contábil.');
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section className="card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>📘 Ledger de Partida Dobrada (<code>/lancamentos</code>) &amp; Fechamentos (<code>/fechamentos</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Livro razão contábil imutável em centavos inteiros: estornos geram novos lançamentos com Débito/Crédito invertidos e períodos fechados bloqueiam escrita retroativa.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            style={{ background: exibirPlanoContas ? '#1e3a8a' : '#eef2ff', color: exibirPlanoContas ? '#fff' : '#1e3a8a', minHeight: '38px', fontSize: '13px' }}
            onClick={() => setExibirPlanoContas(v => !v)}
          >
            📋 {exibirPlanoContas ? 'Ocultar Plano de Contas' : 'Ver Plano de Contas Oficial'}
          </button>
          {nav && (
            <button
              type="button"
              className="btn"
              style={{ background: '#047857', color: '#fff', minHeight: '38px', fontSize: '13px' }}
              onClick={() => nav.navegarPara('fechamento')}
            >
              🔒 Fechamento Mensal &amp; Balancete →
            </button>
          )}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '14px' }}>
        <div className="kpi" style={{ border: '2px solid #1e3a8a' }}>
          <span>Partidas Dobradas no Razão</span>
          <span className="num" style={{ fontSize: '21px', color: '#1e3a8a' }}>{lancs.length}</span>
          <span className="sub">Lançamentos imutáveis</span>
        </div>
        <div className="kpi">
          <span>Volume Contabilizado</span>
          <span className="num" style={{ fontSize: '20px', color: '#065f46' }}>{formatBRL(totMovimentado)}</span>
          <span className="sub">Soma Débito = Soma Crédito</span>
        </div>
        <div className="kpi">
          <span>Lançamentos de Estorno</span>
          <span className="num" style={{ fontSize: '20px', color: '#9a3412' }}>{qtdEstornos}</span>
          <span className="sub">Reversões auditadas</span>
        </div>
        <div className="kpi">
          <span>Competências Fechadas</span>
          <span className="num" style={{ fontSize: '20px' }}>{fechs.filter(f => f.fechado !== false).length}</span>
          <span className="sub">Bloqueadas contra retroação</span>
        </div>
      </div>

      {exibirPlanoContas && (
        <section className="card" style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}>
          <h3 className="h2" style={{ fontSize: '15px', marginBottom: '10px' }}>Catálogo Oficial do Plano de Contas DiskIngressos (<code>PLANO_CONTAS</code>)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px' }}>
            {CATALOGO_PLANO_CONTAS.map(c => (
              <div key={c.codigo} style={{ padding: '8px 12px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12.5px' }}>
                <div style={{ fontWeight: 800, color: '#1e3a8a' }}>{c.codigo} · {c.nome}</div>
                <div className="sub" style={{ fontSize: '11px' }}>Grupo: {c.natureza}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {msgSucesso && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontWeight: 700, fontSize: '13.5px' }}>
          {msgSucesso}
        </div>
      )}
      {erroMsg && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 700, fontSize: '13.5px' }}>
          {erroMsg}
        </div>
      )}

      {estornoAlvoId && (
        <section className="card" style={{ border: '2px solid #c2410c', background: '#fffaf5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 className="h2" style={{ fontSize: '16px', margin: 0, color: '#9a3412' }}>
              ↩️ Emitir Lançamento Contábil de Estorno · Origem <code>{estornoAlvoId}</code>
            </h3>
            <button
              type="button"
              className="btn"
              style={{ background: '#e2e8f0', color: '#0f1b3d', minHeight: '34px', fontSize: '12px' }}
              onClick={() => setEstornoAlvoId(null)}
            >
              Cancelar
            </button>
          </div>
          <p className="sub" style={{ marginBottom: '12px' }}>
            O lançamento original permanece intacto no Razão. Um novo lançamento com <strong>Conta Débito</strong> e <strong>Conta Crédito</strong> invertidas será gravado.
          </p>
          <form
            onSubmit={handleConfirmarEstorno}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', alignItems: 'end' }}
          >
            <label className="lb" style={{ fontSize: '12px' }}>
              Data do Estorno
              <input className="in tx" type="date" value={dataEstorno} onChange={e => setDataEstorno(e.target.value)} required />
            </label>
            <label className="lb" style={{ fontSize: '12px' }}>
              Motivo Obrigatório do Estorno (Auditoria)
              <input
                className="in tx"
                placeholder="Ex: Reversão por divergência de protocolo bancário"
                value={motivoEstorno}
                onChange={e => setMotivoEstorno(e.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              className="btn"
              style={{ background: '#c2410c', color: '#fff', minHeight: '40px', fontSize: '13px' }}
              disabled={processando}
            >
              {processando ? 'Emitindo Estorno...' : '↩️ Confirmar Estorno em Partida Dobrada'}
            </button>
          </form>
        </section>
      )}

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
          <h3 className="h2" style={{ fontSize: '16px', margin: 0 }}>Livro Razão de Lançamentos Contábeis (<code>/lancamentos</code>)</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select
              className="in tx"
              style={{ width: 'auto', minHeight: '36px', padding: '6px 10px' }}
              value={filtroCompetencia}
              onChange={e => setFiltroCompetencia(e.target.value)}
            >
              <option value="Todas">Todas as competências</option>
              {competenciasSet.map(c => (
                <option key={c} value={c}>Competência {c}</option>
              ))}
            </select>
            <input
              className="in tx"
              style={{ width: '240px', minHeight: '36px', padding: '6px 10px' }}
              placeholder="Buscar conta, histórico, evento..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
        </div>

        {lancsFiltrados.length === 0 ? (
          <p className="sub">Nenhum lançamento contábil registrado para o filtro selecionado.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '8px' }}>ID / Competência</th>
                  <th style={{ padding: '8px' }}>Débito</th>
                  <th style={{ padding: '8px' }}>Crédito</th>
                  <th style={{ padding: '8px' }}>Histórico</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Valor</th>
                  <th style={{ padding: '8px' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {lancsFiltrados.map(l => {
                  const jaEstornado = Boolean(l.estornadoPorLancamentoId);
                  const ehEstorno = Boolean(l.estornoDeLancamentoId);
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid #e2e8f0', background: ehEstorno ? '#fffaf5' : undefined }}>
                      <td style={{ padding: '8px', fontWeight: 700 }}>
                        <div>{l.id} ({String(l.competencia || '')})</div>
                        <div className="sub" style={{ fontSize: '11.5px' }}>
                          {String(l.dataLancamento || l.data || '')} · {String(l.eventoId || l.origemModulo || 'Geral')}
                        </div>
                      </td>
                      <td style={{ padding: '8px', fontSize: '12.5px' }}>{String(l.contaDebito || '')}</td>
                      <td style={{ padding: '8px', fontSize: '12.5px' }}>{String(l.contaCredito || '')}</td>
                      <td style={{ padding: '8px' }}>
                        <div>{String(l.historico || '')}</div>
                        {jaEstornado && (
                          <span className="bdg warn" style={{ marginTop: '4px' }}>
                            Estornado por {String(l.estornadoPorLancamentoId)}
                          </span>
                        )}
                        {ehEstorno && (
                          <span className="bdg info" style={{ marginTop: '4px' }}>
                            Estorno de {String(l.estornoDeLancamentoId)}
                          </span>
                        )}
                      </td>
                      <td className="num" style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>
                        {formatBRL(Number(l.valor || 0))}
                      </td>
                      <td style={{ padding: '8px' }}>
                        {!jaEstornado && !ehEstorno ? (
                          <button
                            type="button"
                            className="btn"
                            style={{ background: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa', minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => {
                              setEstornoAlvoId(l.id);
                              setMotivoEstorno(`Estorno operacional do lançamento ${l.id}`);
                            }}
                          >
                            ↩️ Estornar
                          </button>
                        ) : (
                          <span className="sub" style={{ fontSize: '12px' }}>Imutável</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export const ledgerModule: FinancialModulePlugin = {
  id: 'ledger',
  title: 'Ledger & Fechamentos',
  description: 'Razão contábil imutável com partida dobrada (/lancamentos) e congelamento mensal (/fechamentos).',
  rtdbNode: 'lancamentos',
  requiresJavaService: true,
  render: (dados, _sessao, nav) => <LedgerInteractiveView dados={dados} nav={nav} />
};
