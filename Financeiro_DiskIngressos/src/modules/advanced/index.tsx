import { useState, useEffect } from 'react';
import type { FinancialModulePlugin, ModuloNavegacaoProps } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import {
  salvarAdvancedRTDB,
  removerAdvancedRTDB,
  type EstadoFinanceiroRTDB,
  type SessaoFinanceiro
} from '../../shared/firebaseFinanceiro';

interface AdvancedRow {
  id: string;
  produtoraId: string;
  data: string;
  descricao: string;
  valor: number;
  escopo: string;
  abaterNoProximo: boolean;
}

function AdvancedInteractiveView({
  dados,
  sessao,
  nav
}: {
  dados?: EstadoFinanceiroRTDB;
  sessao?: SessaoFinanceiro | null;
  nav?: ModuloNavegacaoProps;
}) {
  const advancedRaw = dados?.advanced || {};
  const produtorasRaw = dados?.produtoras || {};
  const eventosRaw = dados?.eventos || {};

  const [filtroProdId, setFiltroProdId] = useState<string>(nav?.filtroProdutoraId || 'todas');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'abater' | 'compensado'>('todos');
  const [linhas, setLinhas] = useState<Record<string, AdvancedRow>>({});

  // Novo Advanced
  const [novaProdId, setNovaProdId] = useState<string>(Object.keys(produtorasRaw)[0] || 'prod_exemplo');
  const [novaData, setNovaData] = useState<string>('29/10/2026');
  const [novaDesc, setNovaDesc] = useState<string>('Adiantamento contratual de turnê');
  const [novoValor, setNovoValor] = useState<string>('1500');
  const [novoEscopo, setNovoEscopo] = useState<string>('consolidado');
  const [novoAbater, setNovoAbater] = useState<boolean>(true);

  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [msgSucesso, setMsgSucesso] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  useEffect(() => {
    const mapa: Record<string, AdvancedRow> = {};
    for (const [id, raw] of Object.entries(advancedRaw)) {
      mapa[id] = {
        id,
        produtoraId: String(raw.produtoraId || 'prod_exemplo'),
        data: String(raw.data || '01/10/2026'),
        descricao: String(raw.descricao || 'Adiantamento Contratual'),
        valor: Number(raw.valor || 0),
        escopo: String(raw.escopo || 'consolidado'),
        abaterNoProximo: Boolean(raw.abaterNoProximo)
      };
    }
    setLinhas(mapa);
  }, [advancedRaw]);

  const listaTodas = Object.values(linhas);
  const totContratado = listaTodas.reduce((s, a) => s + Number(a.valor || 0), 0);
  const totAbater = listaTodas.filter(a => a.abaterNoProximo).reduce((s, a) => s + Number(a.valor || 0), 0);
  const totCompensado = listaTodas.filter(a => !a.abaterNoProximo).reduce((s, a) => s + Number(a.valor || 0), 0);

  const listaFiltrada = listaTodas.filter(a => {
    if (filtroProdId !== 'todas' && a.produtoraId !== filtroProdId) return false;
    if (filtroStatus === 'abater' && !a.abaterNoProximo) return false;
    if (filtroStatus === 'compensado' && a.abaterNoProximo) return false;
    return true;
  });

  function editarLinha(id: string, patch: Partial<AdvancedRow>) {
    setLinhas(prev => {
      const atual = prev[id];
      if (!atual) return prev;
      return { ...prev, [id]: { ...atual, ...patch } };
    });
  }

  async function handleAdicionarAdvanced(e: React.FormEvent) {
    e.preventDefault();
    setErroMsg(null);
    setMsgSucesso(null);
    setSalvandoId('novo');
    try {
      const criado = await salvarAdvancedRTDB({
        produtoraId: novaProdId,
        data: novaData.trim() || '29/10/2026',
        descricao: novaDesc.trim() || 'Novo Adiantamento',
        valor: Number(novoValor || 0),
        escopo: novoEscopo,
        abaterNoProximo: novoAbater,
        usuarioEmail: sessao?.email || 'financeiro@diskingressos.com.br'
      });
      setMsgSucesso(`✓ Adiantamento ${criado.id} (${formatBRL(Number(novoValor || 0))}) registrado e auditado!`);
      setNovaDesc('Adiantamento contratual');
      setNovoValor('1000');
    } catch (err) {
      setErroMsg(err instanceof Error ? err.message : 'Erro ao incluir adiantamento.');
    } finally {
      setSalvandoId(null);
    }
  }

  async function handleSalvarLinha(row: AdvancedRow) {
    setErroMsg(null);
    setMsgSucesso(null);
    setSalvandoId(row.id);
    try {
      await salvarAdvancedRTDB({
        id: row.id,
        produtoraId: row.produtoraId,
        data: row.data,
        descricao: row.descricao,
        valor: Number(row.valor || 0),
        escopo: row.escopo,
        abaterNoProximo: row.abaterNoProximo,
        usuarioEmail: sessao?.email || 'financeiro@diskingressos.com.br'
      });
      setMsgSucesso(`✓ Adiantamento ${row.id} atualizado com sucesso no RTDB e na Trilha de Auditoria!`);
    } catch (err) {
      setErroMsg(err instanceof Error ? err.message : 'Erro ao atualizar adiantamento.');
    } finally {
      setSalvandoId(null);
    }
  }

  async function handleRemoverLinha(id: string) {
    setErroMsg(null);
    setMsgSucesso(null);
    setSalvandoId(id);
    try {
      await removerAdvancedRTDB({
        id,
        usuarioEmail: sessao?.email || 'financeiro@diskingressos.com.br'
      });
      setMsgSucesso(`✓ Adiantamento ${id} removido e registrado na Trilha de Auditoria.`);
    } catch (err) {
      setErroMsg(err instanceof Error ? err.message : 'Erro ao remover adiantamento.');
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section className="card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>🏷️ Advanced · Adiantamentos Contratuais (<code>/advanced</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Adiantamentos contratuais podem ser abatidos do saldo consolidado da produtora ou diretamente do resultado de um evento específico.
          </p>
        </div>
        {nav && (
          <button
            type="button"
            className="btn"
            style={{ background: '#eef2ff', color: '#1e3a8a', minHeight: '38px', fontSize: '13px' }}
            onClick={() => nav.navegarPara('saldos')}
          >
            📊 Ver Impacto em Saldos →
          </button>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
        <div className="kpi" style={{ border: '2px solid #c2410c' }}>
          <span>Marcado p/ Abater no Próximo</span>
          <span className="num" style={{ fontSize: '21px', color: '#9a3412' }}>{formatBRL(totAbater)}</span>
          <span className="sub">Deduzido do saldo disponível/evento</span>
        </div>
        <div className="kpi">
          <span>Já Compensado em Repasses</span>
          <span className="num" style={{ fontSize: '20px', color: '#065f46' }}>{formatBRL(totCompensado)}</span>
          <span className="sub">Contratos já quitados</span>
        </div>
        <div className="kpi">
          <span>Volume Total Contratado</span>
          <span className="num" style={{ fontSize: '20px' }}>{formatBRL(totContratado)}</span>
          <span className="sub">{listaTodas.length} contrato(s) registrado(s)</span>
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
        <h3 className="h2" style={{ fontSize: '16px', marginBottom: '10px' }}>+ Novo Advanced (Adiantamento Contratual)</h3>
        <form
          onSubmit={handleAdicionarAdvanced}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'end' }}
        >
          <label className="lb" style={{ fontSize: '12px' }}>
            Produtora
            <select className="in tx" value={novaProdId} onChange={e => setNovaProdId(e.target.value)}>
              {Object.entries(produtorasRaw).map(([id, p]) => (
                <option key={id} value={id}>{String(p.nome || id)}</option>
              ))}
              {Object.keys(produtorasRaw).length === 0 && <option value="prod_exemplo">prod_exemplo</option>}
            </select>
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Data
            <input className="in tx" value={novaData} onChange={e => setNovaData(e.target.value)} placeholder="DD/MM/AAAA" required />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Descrição do Adiantamento
            <input className="in tx" value={novaDesc} onChange={e => setNovaDesc(e.target.value)} required />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Valor (R$)
            <input className="in" type="number" step="50" min="0" value={novoValor} onChange={e => setNovoValor(e.target.value)} required />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Abater de (Escopo)
            <select className="in tx" value={novoEscopo} onChange={e => setNovoEscopo(e.target.value)}>
              <option value="consolidado">Consolidado da produtora</option>
              {Object.entries(eventosRaw).map(([evId, ev]) => (
                <option key={evId} value={evId}>Evento: {String(ev.nome || evId)}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, minHeight: '40px', cursor: 'pointer' }}>
            <input type="checkbox" checked={novoAbater} onChange={e => setNovoAbater(e.target.checked)} />
            Abater no próximo
          </label>
          <button
            type="submit"
            className="btn"
            style={{ background: '#1e3a8a', color: '#fff', minHeight: '40px', fontSize: '13px' }}
            disabled={salvandoId === 'novo'}
          >
            {salvandoId === 'novo' ? 'Lançando...' : '+ Novo Advanced'}
          </button>
        </form>
      </section>

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
          <h3 className="h2" style={{ fontSize: '16px', margin: 0 }}>
            Contratos de Advanced Registrados (Total marcado p/ abater: {formatBRL(totAbater)})
          </h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select className="in tx" style={{ width: 'auto', minHeight: '36px', padding: '6px 10px' }} value={filtroProdId} onChange={e => setFiltroProdId(e.target.value)}>
              <option value="todas">Todas as produtoras</option>
              {Object.entries(produtorasRaw).map(([id, p]) => (
                <option key={id} value={id}>{String(p.nome || id)}</option>
              ))}
            </select>
            <select className="in tx" style={{ width: 'auto', minHeight: '36px', padding: '6px 10px' }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as 'todos' | 'abater' | 'compensado')}>
              <option value="todos">Todos</option>
              <option value="abater">A abater no próximo</option>
              <option value="compensado">Já compensados</option>
            </select>
          </div>
        </div>

        {listaFiltrada.length === 0 ? (
          <p className="sub">Nenhum adiantamento contratual registrado para o filtro selecionado.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '8px' }}>Abater</th>
                  <th style={{ padding: '8px' }}>ID / Produtora</th>
                  <th style={{ padding: '8px' }}>Data</th>
                  <th style={{ padding: '8px' }}>Descrição</th>
                  <th style={{ padding: '8px' }}>Valor (R$)</th>
                  <th style={{ padding: '8px' }}>Abater de (Escopo)</th>
                  <th style={{ padding: '8px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="checkbox"
                        checked={a.abaterNoProximo}
                        onChange={e => editarLinha(a.id, { abaterNoProximo: e.target.checked })}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ fontWeight: 800 }}>{a.id}</div>
                      <div className="sub" style={{ fontSize: '11.5px' }}>
                        {String((produtorasRaw[a.produtoraId] || {}).nome || a.produtoraId)}
                      </div>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="in tx"
                        style={{ width: '115px', padding: '6px', minHeight: '36px' }}
                        value={a.data}
                        onChange={e => editarLinha(a.id, { data: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="in tx"
                        style={{ minWidth: '180px', padding: '6px', minHeight: '36px' }}
                        value={a.descricao}
                        onChange={e => editarLinha(a.id, { descricao: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        className="in"
                        style={{ width: '125px', padding: '6px', minHeight: '36px' }}
                        type="number"
                        step="50"
                        value={a.valor}
                        onChange={e => editarLinha(a.id, { valor: Number(e.target.value || 0) })}
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <select
                        className="in tx"
                        style={{ padding: '6px', minHeight: '36px' }}
                        value={a.escopo}
                        onChange={e => editarLinha(a.id, { escopo: e.target.value })}
                      >
                        <option value="consolidado">Consolidado da produtora</option>
                        {Object.entries(eventosRaw).map(([evId, ev]) => (
                          <option key={evId} value={evId}>Evento: {String(ev.nome || evId)}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ background: '#047857', color: '#fff', minHeight: '34px', padding: '6px 10px', fontSize: '12px' }}
                          disabled={salvandoId === a.id}
                          onClick={() => handleSalvarLinha(a)}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ background: '#dc2626', color: '#fff', minHeight: '34px', padding: '6px 10px', fontSize: '12px' }}
                          disabled={salvandoId === a.id}
                          onClick={() => handleRemoverLinha(a.id)}
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

export const advancedModule: FinancialModulePlugin = {
  id: 'advanced',
  title: 'Advanced (Adiantamentos)',
  description: 'Adiantamentos contratuais por evento ou no escopo consolidado da produtora.',
  rtdbNode: 'advanced',
  render: (dados, sessao, nav) => <AdvancedInteractiveView dados={dados} sessao={sessao} nav={nav} />
};
