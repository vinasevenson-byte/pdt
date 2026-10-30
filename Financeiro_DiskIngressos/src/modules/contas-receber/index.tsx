import { useState } from 'react';
import type { FinancialModulePlugin, ModuloNavegacaoProps } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import {
  chamarRegistrarBaixaTitulo,
  criarTituloFinanceiroRTDB,
  type EstadoFinanceiroRTDB,
  type SessaoFinanceiro
} from '../../shared/firebaseFinanceiro';

function ContasReceberInteractiveView({
  dados,
  sessao,
  nav
}: {
  dados?: EstadoFinanceiroRTDB;
  sessao?: SessaoFinanceiro | null;
  nav?: ModuloNavegacaoProps;
}) {
  const crRaw = dados?.contasReceber || {};
  const eventosRaw = dados?.eventos || {};
  const produtorasRaw = dados?.produtoras || {};

  const [filtroStatus, setFiltroStatus] = useState<string>('Todos');
  const [busca, setBusca] = useState<string>('');

  // Novo Título a Receber
  const primeiroEvId = Object.keys(eventosRaw)[0] || 'polaquedo';
  const [eventoId, setEventoId] = useState<string>(primeiroEvId);
  const [categoria, setCategoria] = useState<string>('Bilheteria Adquirente');
  const [adquirente, setAdquirente] = useState<string>('Stone / PIX Gateway');
  const [vencimento, setVencimento] = useState<string>('2026-11-05');
  const [valorOriginal, setValorOriginal] = useState<string>('3500');

  // Baixa de Recebimento
  const [tituloBaixaId, setTituloBaixaId] = useState<string | null>(null);
  const [dataBaixa, setDataBaixa] = useState<string>('2026-10-29');
  const [contaBanco, setContaBanco] = useState<string>('1.1.01.02 - Conta Movimento Bancária Disk');
  const [historicoBaixa, setHistoricoBaixa] = useState<string>('');

  const [processando, setProcessando] = useState<boolean>(false);
  const [msgSucesso, setMsgSucesso] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  const lista = Object.entries(crRaw).map(([id, t]): Record<string, unknown> & { id: string } => ({
    ...(t as Record<string, unknown>),
    id
  }));
  const totOriginal = lista.reduce((s, t) => s + Number(t.valorOriginal || 0), 0);
  const totRecebido = lista.reduce((s, t) => s + Number(t.valorRecebido || 0), 0);
  const totAberto = lista
    .filter(t => t.status !== 'Recebida' && t.status !== 'LiquidadoAdquirente' && t.status !== 'Cancelada')
    .reduce((s, t) => s + Math.max(0, Number(t.valorOriginal || 0) - Number(t.valorRecebido || 0)), 0);
  const qtdAberto = lista.filter(
    t => t.status !== 'Recebida' && t.status !== 'LiquidadoAdquirente' && t.status !== 'Cancelada'
  ).length;

  const buscaNorm = busca.trim().toLowerCase();
  const listaFiltrada = lista.filter(t => {
    const st = String(t.status || 'Prevista');
    if (filtroStatus !== 'Todos' && st !== filtroStatus) return false;
    if (buscaNorm) {
      const txt = `${t.id} ${t.categoria || ''} ${t.adquirente || ''} ${t.eventoId || ''}`.toLowerCase();
      if (!txt.includes(buscaNorm)) return false;
    }
    return true;
  });

  async function handleCriarTitulo(e: React.FormEvent) {
    e.preventDefault();
    setErroMsg(null);
    setMsgSucesso(null);
    setProcessando(true);
    try {
      const prodId = String((eventosRaw[eventoId] || {}).produtoraId || Object.keys(produtorasRaw)[0] || 'prod_exemplo');
      const criado = await criarTituloFinanceiroRTDB({
        natureza: 'receber',
        produtoraId: prodId,
        eventoId,
        categoria: categoria.trim(),
        fornecedorOuOrigem: adquirente.trim(),
        vencimento,
        valorOriginal: Number(valorOriginal || 0),
        usuarioEmail: sessao?.email || 'financeiro@diskingressos.com.br'
      });
      setMsgSucesso(`✓ Título a receber ${String((criado as Record<string, unknown>).id || '')} incluído com sucesso!`);
      setValorOriginal('2500');
    } catch (err) {
      setErroMsg(err instanceof Error ? err.message : 'Erro ao criar título a receber.');
    } finally {
      setProcessando(false);
    }
  }

  async function handleConfirmarRecebimento(e: React.FormEvent) {
    e.preventDefault();
    if (!tituloBaixaId) return;
    setErroMsg(null);
    setMsgSucesso(null);
    setProcessando(true);
    try {
      await chamarRegistrarBaixaTitulo({
        natureza: 'receber',
        tituloId: tituloBaixaId,
        dataBaixa,
        contaBanco,
        historico: historicoBaixa.trim() || `Recebimento bancário do título ${tituloBaixaId}`
      });
      setMsgSucesso(`✓ Recebimento do título ${tituloBaixaId} contabilizado com partida dobrada no Ledger e atualizado no Fluxo de Caixa!`);
      setTituloBaixaId(null);
      setHistoricoBaixa('');
    } catch (err) {
      setErroMsg(err instanceof Error ? err.message : 'Erro ao registrar recebimento do título.');
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section className="card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>💰 Contas a Receber (<code>/contas_receber</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Direitos creditórios sobre adquirentes/gateways, PIX de bilheteria, taxas administrativas/operacionais Disk e recomposições de saldo.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {nav && (
            <>
              <button
                type="button"
                className="btn"
                style={{ background: '#eef2ff', color: '#1e3a8a', minHeight: '38px', fontSize: '13px' }}
                onClick={() => nav.navegarPara('recebiveis')}
              >
                💳 Agenda de Adquirentes (MDR) →
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#f8fafc', color: '#0f1b3d', border: '1px solid #cbd5e1', minHeight: '38px', fontSize: '13px' }}
                onClick={() => nav.navegarPara('ledger')}
              >
                📘 Ver Livro Razão (Ledger) →
              </button>
            </>
          )}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '14px' }}>
        <div className="kpi" style={{ border: '2px solid #1e3a8a' }}>
          <span>A Receber em Aberto</span>
          <span className="num" style={{ fontSize: '21px', color: '#1e3a8a' }}>{formatBRL(totAberto)}</span>
          <span className="sub">{qtdAberto} título(s) previsto(s)</span>
        </div>
        <div className="kpi" style={{ border: '2px solid #047857' }}>
          <span>Total Recebido / Liquidado</span>
          <span className="num" style={{ fontSize: '20px', color: '#065f46' }}>{formatBRL(totRecebido)}</span>
          <span className="sub">Ingressado no caixa Disk</span>
        </div>
        <div className="kpi">
          <span>Volume Original Emitido</span>
          <span className="num" style={{ fontSize: '20px' }}>{formatBRL(totOriginal)}</span>
          <span className="sub">{lista.length} direito(s) creditório(s)</span>
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

      {tituloBaixaId && (
        <section className="card" style={{ border: '2px solid #047857', background: '#f0fdf4' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 className="h2" style={{ fontSize: '16px', margin: 0, color: '#065f46' }}>
              💰 Registrar Recebimento Bancário · Título <code>{tituloBaixaId}</code>
            </h3>
            <button
              type="button"
              className="btn"
              style={{ background: '#e2e8f0', color: '#0f1b3d', minHeight: '34px', fontSize: '12px' }}
              onClick={() => setTituloBaixaId(null)}
            >
              Cancelar
            </button>
          </div>
          <form
            onSubmit={handleConfirmarRecebimento}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', alignItems: 'end' }}
          >
            <label className="lb" style={{ fontSize: '12px' }}>
              Data do Recebimento
              <input className="in tx" type="date" value={dataBaixa} onChange={e => setDataBaixa(e.target.value)} required />
            </label>
            <label className="lb" style={{ fontSize: '12px' }}>
              Conta Bancária (Débito no Ledger)
              <input className="in tx" value={contaBanco} onChange={e => setContaBanco(e.target.value)} required />
            </label>
            <label className="lb" style={{ fontSize: '12px' }}>
              Histórico do Lançamento
              <input
                className="in tx"
                placeholder={`Recebimento bancário do título ${tituloBaixaId}`}
                value={historicoBaixa}
                onChange={e => setHistoricoBaixa(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn"
              style={{ background: '#047857', color: '#fff', minHeight: '40px', fontSize: '13px' }}
              disabled={processando}
            >
              {processando ? 'Contabilizando...' : '✓ Confirmar Recebimento e Gerar Partida Dobrada'}
            </button>
          </form>
        </section>
      )}

      <section className="card">
        <h3 className="h2" style={{ fontSize: '16px', marginBottom: '10px' }}>+ Incluir Novo Título em Contas a Receber</h3>
        <form
          onSubmit={handleCriarTitulo}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'end' }}
        >
          <label className="lb" style={{ fontSize: '12px' }}>
            Evento
            <select className="in tx" value={eventoId} onChange={e => setEventoId(e.target.value)}>
              {Object.entries(eventosRaw).map(([evId, ev]) => (
                <option key={evId} value={evId}>{String(ev.nome || evId)}</option>
              ))}
              {Object.keys(eventosRaw).length === 0 && <option value="polaquedo">Polaquedo</option>}
            </select>
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Categoria do Recebível
            <select className="in tx" value={categoria} onChange={e => setCategoria(e.target.value)}>
              <option value="Bilheteria Adquirente">Bilheteria Adquirente</option>
              <option value="Taxa Administrativa Disk">Taxa Administrativa Disk</option>
              <option value="Taxa Operacional Disk">Taxa Operacional Disk</option>
              <option value="Recomposição de Saldo">Recomposição de Saldo</option>
            </select>
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Origem / Adquirente
            <input className="in tx" value={adquirente} onChange={e => setAdquirente(e.target.value)} required />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Previsão de Liquidação
            <input className="in tx" type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} required />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Valor Original (R$)
            <input className="in" type="number" step="50" min="0.01" value={valorOriginal} onChange={e => setValorOriginal(e.target.value)} required />
          </label>
          <button
            type="submit"
            className="btn"
            style={{ background: '#1e3a8a', color: '#fff', minHeight: '40px', fontSize: '13px' }}
            disabled={processando}
          >
            + Incluir Recebível
          </button>
        </form>
      </section>

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
          <h3 className="h2" style={{ fontSize: '16px', margin: 0 }}>Carteira de Recebíveis (<code>/contas_receber</code>)</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select className="in tx" style={{ width: 'auto', minHeight: '36px', padding: '6px 10px' }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="Todos">Todos os status</option>
              <option value="Prevista">Prevista</option>
              <option value="Recebida">Recebida</option>
              <option value="LiquidadoAdquirente">LiquidadoAdquirente</option>
              <option value="Vencida">Vencida</option>
            </select>
            <input
              className="in tx"
              style={{ width: '220px', minHeight: '36px', padding: '6px 10px' }}
              placeholder="Buscar ID, categoria, evento..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
        </div>

        {listaFiltrada.length === 0 ? (
          <p className="sub">Nenhum título a receber encontrado para o filtro selecionado.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '8px' }}>Título ID</th>
                  <th style={{ padding: '8px' }}>Categoria / Origem</th>
                  <th style={{ padding: '8px' }}>Evento / Vencimento</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Valor Original</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Valor Recebido</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map(t => {
                  const statusStr = String(t.status || 'Prevista');
                  const jaRecebido = statusStr === 'Recebida' || statusStr === 'LiquidadoAdquirente';
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px', fontWeight: 800 }}>{t.id}</td>
                      <td style={{ padding: '8px' }}>
                        <strong>{String(t.categoria || 'Recebível')}</strong>
                        <div className="sub" style={{ fontSize: '12px' }}>{String(t.adquirente || t.meioPagamento || 'Gateway / PIX')}</div>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div>{String(t.eventoId || 'Consolidado')}</div>
                        <div className="sub" style={{ fontSize: '11.5px' }}>Venc: {String(t.vencimento || t.criadoEm || '—')}</div>
                      </td>
                      <td className="num" style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(t.valorOriginal || 0))}</td>
                      <td className="num" style={{ padding: '8px', textAlign: 'right', color: '#065f46' }}>{formatBRL(Number(t.valorRecebido || 0))}</td>
                      <td style={{ padding: '8px' }}>
                        <span
                          className="bdg"
                          style={{
                            margin: 0,
                            background: jaRecebido ? '#dcfce7' : '#eef2ff',
                            color: jaRecebido ? '#065f46' : '#1e3a8a'
                          }}
                        >
                          {statusStr}
                        </span>
                      </td>
                      <td style={{ padding: '8px' }}>
                        {!jaRecebido ? (
                          <button
                            type="button"
                            className="btn"
                            style={{ background: '#047857', color: '#fff', minHeight: '34px', padding: '6px 12px', fontSize: '12px' }}
                            onClick={() => {
                              setTituloBaixaId(t.id);
                              setHistoricoBaixa(`Liquidação de recebível ${String(t.categoria || '')} (${t.id})`);
                            }}
                          >
                            💰 Registrar Recebimento
                          </button>
                        ) : (
                          <span className="sub" style={{ fontSize: '12px' }}>{String(t.dataBaixa || 'Recebido')}</span>
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

export const contasReceberModule: FinancialModulePlugin = {
  id: 'contas_receber',
  title: 'Contas a Receber',
  description: 'Valores a receber de adquirentes/gateways, taxas do Disk, advanced a compensar e antecipações a receber.',
  rtdbNode: 'contas_receber',
  render: (dados, sessao, nav) => <ContasReceberInteractiveView dados={dados} sessao={sessao} nav={nav} />
};
