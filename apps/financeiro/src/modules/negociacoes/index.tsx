import { useState, useEffect } from 'react';
import type { FinancialModulePlugin, ModuloNavegacaoProps } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import {
  salvarNegociacaoEventoRTDB,
  type EstadoFinanceiroRTDB,
  type SessaoFinanceiro
} from '../../shared/firebaseFinanceiro';
import {
  normalizarLocalUI,
  normalizarEventoUI,
  normalizarEventoFinUI,
  normalizarNegociacaoUI,
  calcularEventoUI,
  type NegociacaoUI
} from '../eventos/calcularEventoETravas';

function NegociacoesInteractiveView({
  dados,
  sessao,
  nav
}: {
  dados?: EstadoFinanceiroRTDB;
  sessao?: SessaoFinanceiro | null;
  nav?: ModuloNavegacaoProps;
}) {
  const eventosRaw = dados?.eventos || {};
  const eventosFinRaw = dados?.eventosFin || {};
  const negociacoesRaw = dados?.negociacoes || {};
  const locaisRaw = dados?.locais || {};
  const produtorasRaw = dados?.produtoras || {};
  const despesasRaw = dados?.despesas || {};
  const advancedRaw = dados?.advanced || {};
  const antecipacoesRaw = dados?.antecipacoes || {};

  const [filtroProdId, setFiltroProdId] = useState<string>(nav?.filtroProdutoraId || 'todas');
  const [filtroStatus, setFiltroStatus] = useState<string>('Todos');
  const [busca, setBusca] = useState<string>('');
  const [rascunhos, setRascunhos] = useState<Record<string, NegociacaoUI>>({});
  const [salvandoEvId, setSalvandoEvId] = useState<string | null>(null);
  const [bannerSucesso, setBannerSucesso] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  useEffect(() => {
    const mapa: Record<string, NegociacaoUI> = {};
    for (const evId of Object.keys(eventosRaw)) {
      mapa[evId] = normalizarNegociacaoUI(negociacoesRaw[evId] as Record<string, unknown> | undefined);
    }
    setRascunhos(mapa);
  }, [eventosRaw, negociacoesRaw]);

  function atualizarRascunho(evId: string, updater: (atual: NegociacaoUI) => NegociacaoUI) {
    setRascunhos(prev => {
      const base = prev[evId] || normalizarNegociacaoUI(negociacoesRaw[evId] as Record<string, unknown> | undefined);
      const clone: NegociacaoUI = JSON.parse(JSON.stringify(base));
      return { ...prev, [evId]: updater(clone) };
    });
  }

  const despesasList = Object.entries(despesasRaw).map(([id, d]): Record<string, unknown> & { id: string } => ({
    ...(d as Record<string, unknown>),
    id
  }));
  const advancedList = Object.entries(advancedRaw).map(([id, a]): Record<string, unknown> & { id: string } => ({
    ...(a as Record<string, unknown>),
    id
  }));
  const antecipacoesList = Object.entries(antecipacoesRaw).map(([id, a]): Record<string, unknown> & { id: string } => ({
    ...(a as Record<string, unknown>),
    id
  }));

  const itensCalculados = Object.entries(eventosRaw).map(([evId, evRaw]) => {
    const loc = normalizarLocalUI(locaisRaw[String(evRaw.localId || '')] as Record<string, unknown> | undefined);
    const ev = normalizarEventoUI(evId, evRaw, loc);
    const fin = normalizarEventoFinUI(eventosFinRaw[evId] as Record<string, unknown> | undefined);
    const neg = rascunhos[evId] || normalizarNegociacaoUI(negociacoesRaw[evId] as Record<string, unknown> | undefined);
    const despEv = despesasList.filter(d => String(d.eventoId || '') === evId);
    const advEv = advancedList.filter(a => String(a.escopo || '') === evId);
    const antEv = antecipacoesList.filter(a => String(a.eventoId || '') === evId);
    const calc = calcularEventoUI(ev, fin, neg, despEv, advEv, antEv, loc);
    const prodNome = String((produtorasRaw[ev.produtoraId] || {}).nome || ev.produtoraId);
    return { evId, ev, fin, neg, loc, calc, prodNome };
  });

  const totTaxaOp = itensCalculados.reduce((s, x) => s + x.calc.taxaOp, 0);
  const totTaxaAdmLiq = itensCalculados.reduce((s, x) => s + x.calc.taxaAdmLiquida, 0);
  const totReceitaDisk = totTaxaOp + totTaxaAdmLiq;
  const qtdAtivas = itensCalculados.filter(x => x.neg.status === 'Ativa').length;

  const buscaNorm = busca.trim().toLowerCase();
  const itensFiltrados = itensCalculados.filter(x => {
    if (filtroProdId !== 'todas' && x.ev.produtoraId !== filtroProdId) return false;
    if (filtroStatus !== 'Todos' && x.neg.status !== filtroStatus) return false;
    if (
      buscaNorm &&
      !x.ev.nome.toLowerCase().includes(buscaNorm) &&
      !x.evId.toLowerCase().includes(buscaNorm) &&
      !x.prodNome.toLowerCase().includes(buscaNorm)
    ) {
      return false;
    }
    return true;
  });

  async function handleSalvarNegociacao(evId: string) {
    const item = itensCalculados.find(x => x.evId === evId);
    if (!item) return;
    setSalvandoEvId(evId);
    setErroMsg(null);
    setBannerSucesso(null);
    try {
      const resumo = `Negociação ${item.ev.nome} (${item.neg.status}): Taxa Op ${item.neg.taxaOp.tipo} (${item.neg.taxaOp.valor}) = ${formatBRL(item.calc.taxaOp)}; Conveniência informativa ${item.neg.conveniencia.percentual}%.`;
      await salvarNegociacaoEventoRTDB({
        eventoId: evId,
        negociacao: {
          status: item.neg.status,
          taxaOp: {
            tipo: item.neg.taxaOp.tipo,
            valor: Number(item.neg.taxaOp.valor || 0)
          },
          conveniencia: {
            percentual: Number(item.neg.conveniencia.percentual || 0)
          },
          observacoes: item.neg.observacoes || ''
        },
        usuarioEmail: sessao?.email || 'financeiro@diskingressos.com.br',
        resumoAuditoria: resumo
      });
      setBannerSucesso(`✓ Negociação de "${item.ev.nome}" salva em /negociacoes/${evId} e registrada na Trilha de Auditoria!`);
    } catch (err) {
      setErroMsg(err instanceof Error ? err.message : 'Erro ao salvar negociação.');
    } finally {
      setSalvandoEvId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section className="card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '14px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>🤝 Negociações Comerciais por Evento (<code>/negociacoes</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Configuração exclusiva do Financeiro Disk: Taxa Operacional (R$ por ingresso, % sobre bilheteria ou valor fixo) e Taxa de Conveniência informativa (bloqueadas no RTDB para o Produtor).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {nav && (
            <>
              <button
                type="button"
                className="btn"
                style={{ background: '#eef2ff', color: '#1e3a8a', minHeight: '38px', fontSize: '13px' }}
                onClick={() => nav.navegarPara('eventos')}
              >
                🎛️ Ir para Eventos e Travas →
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#f8fafc', color: '#0f1b3d', border: '1px solid #cbd5e1', minHeight: '38px', fontSize: '13px' }}
                onClick={() => nav.navegarPara('contratos')}
              >
                📜 Contratos Versionados →
              </button>
            </>
          )}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
        <div className="kpi" style={{ border: '2px solid #7c3aed' }}>
          <span>Receita Disk Líquida Total</span>
          <span className="num" style={{ fontSize: '21px', color: '#6d28d9' }}>{formatBRL(totReceitaDisk)}</span>
          <span className="sub">Taxa Adm Líq. + Taxa Operacional</span>
        </div>
        <div className="kpi">
          <span>Total Taxa Operacional</span>
          <span className="num" style={{ fontSize: '20px', color: '#0f1b3d' }}>{formatBRL(totTaxaOp)}</span>
          <span className="sub">Apurada nas negociações</span>
        </div>
        <div className="kpi">
          <span>Total Taxa Adm Líquida</span>
          <span className="num" style={{ fontSize: '20px', color: '#065f46' }}>{formatBRL(totTaxaAdmLiq)}</span>
          <span className="sub">Após créditos (Rebate + Patrocínio)</span>
        </div>
        <div className="kpi">
          <span>Negociações Ativas</span>
          <span className="num" style={{ fontSize: '20px' }}>{qtdAtivas} / {itensCalculados.length}</span>
          <span className="sub">Eventos parametrizados</span>
        </div>
      </div>

      {bannerSucesso && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontWeight: 700, fontSize: '13.5px' }}>
          {bannerSucesso}
        </div>
      )}
      {erroMsg && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 700, fontSize: '13.5px' }}>
          {erroMsg}
        </div>
      )}

      <section className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'end' }}>
        <label className="lb">
          Produtora
          <select className="in tx" value={filtroProdId} onChange={e => setFiltroProdId(e.target.value)}>
            <option value="todas">Todas as produtoras</option>
            {Object.entries(produtorasRaw).map(([id, p]) => (
              <option key={id} value={id}>{String(p.nome || id)}</option>
            ))}
          </select>
        </label>
        <label className="lb">
          Status da Negociação
          <select className="in tx" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="Todos">Todos os status</option>
            <option value="Ativa">Ativa</option>
            <option value="Em revisão">Em revisão</option>
            <option value="Encerrada">Encerrada</option>
          </select>
        </label>
        <label className="lb">
          Buscar evento ou produtora
          <input
            className="in tx"
            placeholder="Ex: Polaquedo, Festival..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </label>
      </section>

      {itensFiltrados.length === 0 ? (
        <section className="card">
          <p className="sub">Nenhum evento encontrado para os filtros selecionados.</p>
        </section>
      ) : (
        <div className="mods" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
          {itensFiltrados.map(({ evId, ev, fin, neg, calc, prodNome }) => (
            <section key={evId} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid #dde2ee' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <h2 className="h2" style={{ margin: 0 }}>{ev.nome}</h2>
                  <div className="sub">{prodNome} · Data: {ev.data} · Vendidos: <strong>{ev.vendas.vendidos} ing.</strong> ({formatBRL(calc.bil)})</div>
                </div>
                <select
                  aria-label={`Status da negociação ${ev.nome}`}
                  className="in tx"
                  style={{ width: 'auto', minHeight: '36px', padding: '6px 10px', fontWeight: 700 }}
                  value={neg.status}
                  onChange={e =>
                    atualizarRascunho(evId, n => {
                      n.status = e.target.value as NegociacaoUI['status'];
                      return n;
                    })
                  }
                >
                  <option value="Ativa">Ativa</option>
                  <option value="Em revisão">Em revisão</option>
                  <option value="Encerrada">Encerrada</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="lb">
                  Forma da Taxa Operacional
                  <select
                    className="in tx"
                    value={neg.taxaOp.tipo}
                    onChange={e =>
                      atualizarRascunho(evId, n => {
                        n.taxaOp.tipo = e.target.value as NegociacaoUI['taxaOp']['tipo'];
                        return n;
                      })
                    }
                  >
                    <option value="porIngresso">R$ por ingresso vendido</option>
                    <option value="percentual">% sobre bilheteria</option>
                    <option value="fixo">Valor fixo (R$)</option>
                  </select>
                </label>
                <label className="lb">
                  Valor da Taxa Op ({neg.taxaOp.tipo === 'percentual' ? '%' : 'R$'})
                  <input
                    className="in"
                    type="number"
                    step="0.5"
                    min="0"
                    value={neg.taxaOp.valor}
                    onChange={e =>
                      atualizarRascunho(evId, n => {
                        n.taxaOp.valor = Number(e.target.value || 0);
                        return n;
                      })
                    }
                  />
                </label>
              </div>

              <div style={{ background: '#f4f6fb', padding: '12px 14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '13.5px' }}>Taxa Operacional Calculada:</span>
                  <span className="num" style={{ fontSize: '16px', color: '#7c3aed', fontWeight: 800 }}>{formatBRL(calc.taxaOp)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', color: '#475569' }}>
                  <span>Taxa Adm Disk ({fin.taxaAdm.percentual}% → Líquida após Rebate/Patroc.):</span>
                  <span className="num" style={{ fontWeight: 700 }}>{formatBRL(calc.taxaAdmLiquida)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', color: '#065f46', borderTop: '1px solid #dde2ee', paddingTop: '6px' }}>
                  <span style={{ fontWeight: 700 }}>Borderô do Produtor (Bilheteria − Taxas Disk):</span>
                  <span className="num" style={{ fontWeight: 800 }}>{formatBRL(calc.bil - calc.taxaAdm - calc.taxaOp)}</span>
                </div>
              </div>

              <label className="lb">
                Taxa de Conveniência (% informativo — paga pelo cliente à parte, nunca entra no cálculo)
                <input
                  className="in"
                  type="number"
                  step="0.5"
                  min="0"
                  value={neg.conveniencia.percentual}
                  onChange={e =>
                    atualizarRascunho(evId, n => {
                      n.conveniencia = { percentual: Number(e.target.value || 0) };
                      return n;
                    })
                  }
                />
              </label>

              <label className="lb">
                Observações da Negociação
                <input
                  className="in tx"
                  placeholder="Ex: Taxa op de R$ 2,00 por ingresso vendido + conveniência 12%..."
                  value={neg.observacoes}
                  onChange={e =>
                    atualizarRascunho(evId, n => {
                      n.observacoes = e.target.value;
                      return n;
                    })
                  }
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}
                  disabled={salvandoEvId === evId}
                  onClick={() => handleSalvarNegociacao(evId)}
                >
                  {salvandoEvId === evId ? 'Salvando...' : '💾 Salvar Negociação (com Auditoria)'}
                </button>
                {nav && (
                  <button
                    type="button"
                    className="btn"
                    style={{ background: '#eef2ff', color: '#1e3a8a', minHeight: '38px', fontSize: '13px' }}
                    onClick={() => nav.navegarPara('eventos', ev.produtoraId)}
                  >
                    Ver Travas do Evento →
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export const negociacoesModule: FinancialModulePlugin = {
  id: 'negociacoes',
  title: 'Negociações',
  description: 'Configuração de Taxa Operacional (fixa, percentual ou por ingresso) e conveniência por evento.',
  rtdbNode: 'negociacoes',
  render: (dados, sessao, nav) => <NegociacoesInteractiveView dados={dados} sessao={sessao} nav={nav} />
};
