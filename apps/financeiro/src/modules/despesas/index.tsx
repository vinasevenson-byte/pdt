import { useState, useEffect } from 'react';
import type { FinancialModulePlugin, ModuloNavegacaoProps } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import {
  salvarDespesaEventoRTDB,
  removerDespesaEventoRTDB,
  type EstadoFinanceiroRTDB,
  type SessaoFinanceiro
} from '../../shared/firebaseFinanceiro';

interface DespesaRow {
  id: string;
  eventoId: string;
  produtoraId: string;
  data: string;
  categoria: string;
  fornecedor: string;
  nfCodigo: string;
  comprovanteUrl: string;
  valor: number;
  status: 'Pago' | 'A pagar';
}

function DespesasInteractiveView({
  dados,
  sessao,
  nav
}: {
  dados?: EstadoFinanceiroRTDB;
  sessao?: SessaoFinanceiro | null;
  nav?: ModuloNavegacaoProps;
}) {
  const despesasRaw = dados?.despesas || {};
  const eventosRaw = dados?.eventos || {};

  const primeiroEvId = Object.keys(eventosRaw)[0] || 'polaquedo';
  const [filtroEventoId, setFiltroEventoId] = useState<string>('todos');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'Pago' | 'A pagar'>('todos');
  const [linhas, setLinhas] = useState<Record<string, DespesaRow>>({});

  // Nova despesa
  const [novoEventoId, setNovoEventoId] = useState<string>(primeiroEvId);
  const [novaData, setNovaData] = useState<string>('29/10/2026');
  const [novaCategoria, setNovaCategoria] = useState<string>('Sonorização e Iluminação');
  const [novoFornecedor, setNovoFornecedor] = useState<string>('AudioSul Eventos Ltda');
  const [novaNf, setNovaNf] = useState<string>('NF-e 000.418');
  const [novoComprovante, setNovoComprovante] = useState<string>('');
  const [novoValor, setNovoValor] = useState<string>('800');
  const [novoStatus, setNovoStatus] = useState<'Pago' | 'A pagar'>('Pago');

  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [msgSucesso, setMsgSucesso] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  useEffect(() => {
    const mapa: Record<string, DespesaRow> = {};
    for (const [id, d] of Object.entries(despesasRaw)) {
      const evId = String(d.eventoId || primeiroEvId);
      const evProdId = String((eventosRaw[evId] || {}).produtoraId || d.produtoraId || 'prod_exemplo');
      mapa[id] = {
        id,
        eventoId: evId,
        produtoraId: evProdId,
        data: String(d.data || '10/10/2026'),
        categoria: String(d.categoria || 'Despesa Operacional'),
        fornecedor: String(d.fornecedor || 'Fornecedor'),
        nfCodigo: String(d.nfCodigo || ''),
        comprovanteUrl: String(d.comprovanteUrl || ''),
        valor: Number(d.valor || 0),
        status: d.status === 'A pagar' ? 'A pagar' : 'Pago'
      };
    }
    setLinhas(mapa);
  }, [despesasRaw, eventosRaw, primeiroEvId]);

  const listaTodas = Object.values(linhas);
  const totGeral = listaTodas.reduce((s, d) => s + Number(d.valor || 0), 0);
  const totPagas = listaTodas.filter(d => d.status === 'Pago').reduce((s, d) => s + Number(d.valor || 0), 0);
  const totAPagar = listaTodas.filter(d => d.status === 'A pagar').reduce((s, d) => s + Number(d.valor || 0), 0);
  const qtdComNf = listaTodas.filter(d => Boolean(d.nfCodigo.trim())).length;

  const listaFiltrada = listaTodas.filter(d => {
    if (filtroEventoId !== 'todos' && d.eventoId !== filtroEventoId) return false;
    if (filtroStatus !== 'todos' && d.status !== filtroStatus) return false;
    return true;
  });

  function editarLinha(id: string, patch: Partial<DespesaRow>) {
    setLinhas(prev => {
      const atual = prev[id];
      if (!atual) return prev;
      return { ...prev, [id]: { ...atual, ...patch } };
    });
  }

  async function handleAdicionarDespesa(e: React.FormEvent) {
    e.preventDefault();
    setErroMsg(null);
    setMsgSucesso(null);
    setSalvandoId('nova');
    try {
      const prodId = String((eventosRaw[novoEventoId] || {}).produtoraId || 'prod_exemplo');
      const criada = await salvarDespesaEventoRTDB({
        eventoId: novoEventoId,
        produtoraId: prodId,
        data: novaData.trim() || '29/10/2026',
        categoria: novaCategoria.trim() || 'Despesa',
        fornecedor: novoFornecedor.trim() || 'Fornecedor',
        nfCodigo: novaNf.trim(),
        comprovanteUrl: novoComprovante.trim(),
        valor: Number(novoValor || 0),
        status: novoStatus,
        usuarioEmail: sessao?.email || 'financeiro@diskingressos.com.br'
      });
      setMsgSucesso(`✓ Despesa ${criada.id} (${formatBRL(Number(novoValor || 0))}) lançada no borderô e registrada na Auditoria!`);
      setNovoValor('500');
      setNovaNf('NF-e 000.999');
    } catch (err) {
      setErroMsg(err instanceof Error ? err.message : 'Erro ao lançar despesa.');
    } finally {
      setSalvandoId(null);
    }
  }

  async function handleSalvarLinha(row: DespesaRow) {
    setErroMsg(null);
    setMsgSucesso(null);
    setSalvandoId(row.id);
    try {
      const prodId = String((eventosRaw[row.eventoId] || {}).produtoraId || row.produtoraId || 'prod_exemplo');
      await salvarDespesaEventoRTDB({
        id: row.id,
        eventoId: row.eventoId,
        produtoraId: prodId,
        data: row.data,
        categoria: row.categoria,
        fornecedor: row.fornecedor,
        nfCodigo: row.nfCodigo,
        comprovanteUrl: row.comprovanteUrl,
        valor: Number(row.valor || 0),
        status: row.status,
        usuarioEmail: sessao?.email || 'financeiro@diskingressos.com.br'
      });
      setMsgSucesso(`✓ Despesa ${row.id} salva e borderô atualizado com sucesso!`);
    } catch (err) {
      setErroMsg(err instanceof Error ? err.message : 'Erro ao salvar despesa.');
    } finally {
      setSalvandoId(null);
    }
  }

  async function handleRemoverLinha(row: DespesaRow) {
    setErroMsg(null);
    setMsgSucesso(null);
    setSalvandoId(row.id);
    try {
      await removerDespesaEventoRTDB({
        id: row.id,
        eventoId: row.eventoId,
        usuarioEmail: sessao?.email || 'financeiro@diskingressos.com.br'
      });
      setMsgSucesso(`✓ Despesa ${row.id} removida e borderô recalculado.`);
    } catch (err) {
      setErroMsg(err instanceof Error ? err.message : 'Erro ao remover despesa.');
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section className="card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>🧾 Despesas por Evento e Comprovantes / Notas Fiscais (<code>/despesas</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Por padrão, todas as despesas (&quot;Pago&quot; + &quot;A pagar&quot;) são abatidas do borderô. Informe o nº da NF/Recibo e link do comprovante para transparência com o produtor.
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
                🎛️ Ver no Borderô do Evento →
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#f8fafc', color: '#0f1b3d', border: '1px solid #cbd5e1', minHeight: '38px', fontSize: '13px' }}
                onClick={() => nav.navegarPara('contas_pagar')}
              >
                📑 Ir para Contas a Pagar →
              </button>
            </>
          )}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '14px' }}>
        <div className="kpi" style={{ border: '2px solid #1e3a8a' }}>
          <span>Total de Despesas</span>
          <span className="num" style={{ fontSize: '21px', color: '#0f1b3d' }}>{formatBRL(totGeral)}</span>
          <span className="sub">{listaTodas.length} lançamento(s) nos eventos</span>
        </div>
        <div className="kpi">
          <span>Despesas Pagas</span>
          <span className="num" style={{ fontSize: '20px', color: '#065f46' }}>{formatBRL(totPagas)}</span>
          <span className="sub">Liquidadas no caixa</span>
        </div>
        <div className="kpi">
          <span>Despesas A Pagar</span>
          <span className="num" style={{ fontSize: '20px', color: '#9a3412' }}>{formatBRL(totAPagar)}</span>
          <span className="sub">Provisionadas no borderô</span>
        </div>
        <div className="kpi">
          <span>Com Nota Fiscal (NF-e)</span>
          <span className="num" style={{ fontSize: '20px' }}>{qtdComNf} / {listaTodas.length}</span>
          <span className="sub">Documentação fiscal</span>
        </div>
      </div>

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

      <section className="card">
        <h3 className="h2" style={{ fontSize: '16px', marginBottom: '10px' }}>+ Lançar Nova Despesa no Evento</h3>
        <form
          onSubmit={handleAdicionarDespesa}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end' }}
        >
          <label className="lb" style={{ fontSize: '12px' }}>
            Evento
            <select className="in tx" value={novoEventoId} onChange={e => setNovoEventoId(e.target.value)}>
              {Object.entries(eventosRaw).map(([evId, ev]) => (
                <option key={evId} value={evId}>{String(ev.nome || evId)}</option>
              ))}
              {Object.keys(eventosRaw).length === 0 && <option value="polaquedo">Polaquedo</option>}
            </select>
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Data
            <input className="in tx" value={novaData} onChange={e => setNovaData(e.target.value)} required />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Categoria
            <input className="in tx" value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} required />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Fornecedor
            <input className="in tx" value={novoFornecedor} onChange={e => setNovoFornecedor(e.target.value)} required />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Nº NF / Doc
            <input className="in tx" value={novaNf} onChange={e => setNovaNf(e.target.value)} placeholder="Ex: NF-e 418" />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Link Comprovante
            <input className="in tx" value={novoComprovante} onChange={e => setNovoComprovante(e.target.value)} placeholder="https://..." />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Valor (R$)
            <input className="in" type="number" step="10" min="0" value={novoValor} onChange={e => setNovoValor(e.target.value)} required />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Status
            <select className="in tx" value={novoStatus} onChange={e => setNovoStatus(e.target.value as 'Pago' | 'A pagar')}>
              <option value="Pago">Pago</option>
              <option value="A pagar">A pagar</option>
            </select>
          </label>
          <button
            type="submit"
            className="btn"
            style={{ background: '#1e3a8a', color: '#fff', minHeight: '40px', fontSize: '13px' }}
            disabled={salvandoId === 'nova'}
          >
            {salvandoId === 'nova' ? 'Lançando...' : '+ Lançar Despesa'}
          </button>
        </form>
      </section>

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
          <h3 className="h2" style={{ fontSize: '16px', margin: 0 }}>Despesas Lançadas nos Eventos</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select className="in tx" style={{ width: 'auto', minHeight: '36px', padding: '6px 10px' }} value={filtroEventoId} onChange={e => setFiltroEventoId(e.target.value)}>
              <option value="todos">Todos os eventos</option>
              {Object.entries(eventosRaw).map(([evId, ev]) => (
                <option key={evId} value={evId}>{String(ev.nome || evId)}</option>
              ))}
            </select>
            <select className="in tx" style={{ width: 'auto', minHeight: '36px', padding: '6px 10px' }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as 'todos' | 'Pago' | 'A pagar')}>
              <option value="todos">Todos os status</option>
              <option value="Pago">Pago</option>
              <option value="A pagar">A pagar</option>
            </select>
          </div>
        </div>

        {listaFiltrada.length === 0 ? (
          <p className="sub">Nenhuma despesa encontrada para os filtros selecionados.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '8px' }}>Evento</th>
                  <th style={{ padding: '8px' }}>Data</th>
                  <th style={{ padding: '8px' }}>Categoria</th>
                  <th style={{ padding: '8px' }}>Fornecedor</th>
                  <th style={{ padding: '8px' }}>Nº NF / Doc</th>
                  <th style={{ padding: '8px' }}>Link Comprovante</th>
                  <th style={{ padding: '8px' }}>Valor (R$)</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px' }}>
                      <select
                        className="in tx"
                        style={{ padding: '6px', minHeight: '36px' }}
                        value={d.eventoId}
                        onChange={e => editarLinha(d.id, { eventoId: e.target.value })}
                      >
                        {Object.entries(eventosRaw).map(([evId, ev]) => (
                          <option key={evId} value={evId}>{String(ev.nome || evId)}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="in tx"
                        style={{ width: '105px', padding: '6px', minHeight: '36px' }}
                        value={d.data}
                        onChange={e => editarLinha(d.id, { data: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="in tx"
                        style={{ minWidth: '130px', padding: '6px', minHeight: '36px' }}
                        value={d.categoria}
                        onChange={e => editarLinha(d.id, { categoria: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="in tx"
                        style={{ minWidth: '130px', padding: '6px', minHeight: '36px' }}
                        value={d.fornecedor}
                        onChange={e => editarLinha(d.id, { fornecedor: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="in tx"
                        style={{ width: '125px', padding: '6px', minHeight: '36px' }}
                        placeholder="Ex: NF-e 418"
                        value={d.nfCodigo}
                        onChange={e => editarLinha(d.id, { nfCodigo: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="in tx"
                        style={{ width: '150px', padding: '6px', minHeight: '36px' }}
                        placeholder="https://..."
                        value={d.comprovanteUrl}
                        onChange={e => editarLinha(d.id, { comprovanteUrl: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="in"
                        style={{ width: '110px', padding: '6px', minHeight: '36px' }}
                        type="number"
                        step="10"
                        value={d.valor}
                        onChange={e => editarLinha(d.id, { valor: Number(e.target.value || 0) })}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <select
                        className="in tx"
                        style={{ padding: '6px', minHeight: '36px' }}
                        value={d.status}
                        onChange={e => editarLinha(d.id, { status: e.target.value as 'Pago' | 'A pagar' })}
                      >
                        <option value="Pago">Pago</option>
                        <option value="A pagar">A pagar</option>
                      </select>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ background: '#047857', color: '#fff', minHeight: '34px', padding: '6px 10px', fontSize: '12px' }}
                          disabled={salvandoId === d.id}
                          onClick={() => handleSalvarLinha(d)}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ background: '#dc2626', color: '#fff', minHeight: '34px', padding: '6px 10px', fontSize: '12px' }}
                          disabled={salvandoId === d.id}
                          onClick={() => handleRemoverLinha(d)}
                        >
                          Remover
                        </button>
                      </div>
                    </td>
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

export const despesasModule: FinancialModulePlugin = {
  id: 'despesas',
  title: 'Despesas de Eventos',
  description: 'Lançamento de despesas pagas e a pagar vinculadas aos eventos com comprovantes e NF.',
  rtdbNode: 'despesas',
  render: (dados, sessao, nav) => <DespesasInteractiveView dados={dados} sessao={sessao} nav={nav} />
};
