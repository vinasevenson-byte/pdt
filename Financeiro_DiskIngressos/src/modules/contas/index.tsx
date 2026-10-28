import { useState } from 'react';
import type { FinancialModulePlugin, FinancialModuleNavContext } from '../../shared/modulePlugin';
import {
  atualizarStatusContaBancariaRTDB,
  cadastrarContaBancariaRTDB,
  type EstadoFinanceiroRTDB,
  type SessaoFinanceiro
} from '../../shared/firebaseFinanceiro';
import { formatBRL } from '../../shared/formatters';

function ContasBancariasView({
  dados,
  sessao,
  nav
}: {
  dados?: EstadoFinanceiroRTDB;
  sessao?: SessaoFinanceiro | null;
  nav?: FinancialModuleNavContext;
}) {
  const porProd = dados?.contasPorProdutora || {};
  const produtoras = dados?.produtoras || {};
  const saldos = dados?.saldos || {};
  const email = sessao?.email || 'financeiro@diskingressos.com.br';

  const filtroProdutora = nav?.filtroProdutoraId || '';
  const [prodNova, setProdNova] = useState<string>(filtroProdutora || Object.keys(produtoras)[0] || 'prod_demo');
  const [banco, setBanco] = useState('');
  const [agencia, setAgencia] = useState('');
  const [conta, setConta] = useState('');
  const [titular, setTitular] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [pix, setPix] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const linhas: Array<{ produtoraId: string; contaId: string; c: Record<string, unknown> }> = [];
  for (const [prodId, mapa] of Object.entries(porProd)) {
    if (filtroProdutora && prodId !== filtroProdutora) continue;
    for (const [cId, c] of Object.entries(mapa || {})) {
      linhas.push({ produtoraId: prodId, contaId: cId, c });
    }
  }

  const saldoProdutoraSelecionada = filtroProdutora ? saldos[filtroProdutora] : null;

  async function handleCadastrarConta(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    const prodAlvo = filtroProdutora || prodNova;
    if (!prodAlvo || !banco.trim() || !agencia.trim() || !conta.trim() || !pix.trim()) {
      setErro('Preencha produtora, banco, agência, conta e chave PIX.');
      return;
    }
    try {
      await cadastrarContaBancariaRTDB(
        prodAlvo,
        {
          banco: banco.trim(),
          agencia: agencia.trim(),
          conta: conta.trim(),
          titular: titular.trim() || String(produtoras[prodAlvo]?.nome || prodAlvo),
          cnpj: cnpj.trim() || String(produtoras[prodAlvo]?.cnpj || ''),
          pix: pix.trim()
        },
        email
      );
      setBanco('');
      setAgencia('');
      setConta('');
      setPix('');
      setMsg(`Conta bancária homologada com sucesso para ${prodAlvo}.`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao cadastrar conta bancária.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>Contas Bancárias e Homologação PIX (<code>/contas/&#123;produtoraId&#125;</code>)</h2>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            Validação de titularidade CNPJ, agência/conta e chaves PIX vinculada à posição de saldos e repasses das produtoras.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <select
            aria-label="Filtrar contas por produtora"
            value={filtroProdutora}
            onChange={e => nav?.setFiltroProdutoraId?.(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          >
            <option value="">Todas as produtoras</option>
            {Object.keys({ ...produtoras, ...porProd }).map(pid => (
              <option key={pid} value={pid}>
                {String(produtoras[pid]?.nome || pid)} ({pid})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => nav?.navegarPara('saldos', filtroProdutora || undefined)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #1e3a8a',
              background: '#eef2ff',
              color: '#1e3a8a',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            ← Ver Posição de Saldos
          </button>
        </div>
      </div>

      {filtroProdutora && saldoProdutoraSelecionada && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '12px 16px'
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
              Posição Financeira · {String(produtoras[filtroProdutora]?.nome || filtroProdutora)}
            </div>
            <div style={{ fontSize: '14px', marginTop: '4px' }}>
              Disponível: <strong style={{ color: '#065f46' }}>{formatBRL(Number(saldoProdutoraSelecionada.saldoDisponivel || 0))}</strong>
              {' · '}Liberável: <strong>{formatBRL(Number(saldoProdutoraSelecionada.saldoLiberavel || 0))}</strong>
              {' · '}Retido: <strong style={{ color: '#9a3412' }}>{formatBRL(Number(saldoProdutoraSelecionada.saldoRetido || 0))}</strong>
            </div>
          </div>
          <button
            type="button"
            onClick={() => nav?.navegarPara('repasses', filtroProdutora)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 0,
              background: '#047857',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Ir para Repasses da Produtora →
          </button>
        </div>
      )}

      {linhas.length === 0 ? (
        <p className="sub">Nenhuma conta bancária encontrada para o filtro selecionado.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>Produtora</th>
              <th style={{ padding: '8px' }}>Titular / CNPJ</th>
              <th style={{ padding: '8px' }}>Banco / Agência / Conta</th>
              <th style={{ padding: '8px' }}>Chave PIX</th>
              <th style={{ padding: '8px' }}>Saldo Disponível</th>
              <th style={{ padding: '8px' }}>Status</th>
              <th style={{ padding: '8px' }}>Homologação e Navegação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ produtoraId, contaId, c }) => {
              const st = String(c.status || 'Pendente');
              const saldoProd = saldos[produtoraId] || {};
              return (
                <tr key={`${produtoraId}_${contaId}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px', fontWeight: 700 }}>
                    <div>{String(produtoras[produtoraId]?.nome || produtoraId)}</div>
                    <code style={{ fontSize: '11px', color: '#64748b' }}>{produtoraId}</code>
                  </td>
                  <td style={{ padding: '8px' }}>
                    <div>{String(c.titular || produtoras[produtoraId]?.nome || '—')}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{String(c.cnpj || produtoras[produtoraId]?.cnpj || '')}</div>
                  </td>
                  <td style={{ padding: '8px' }}>
                    {String(c.banco || '')} · Ag {String(c.agencia || '')} · CC {String(c.conta || '')}
                  </td>
                  <td style={{ padding: '8px' }}><code>{String(c.pix || '')}</code></td>
                  <td style={{ padding: '8px', fontWeight: 700, color: '#065f46' }}>
                    {formatBRL(Number(saldoProd.saldoDisponivel || 0))}
                  </td>
                  <td style={{ padding: '8px', fontWeight: 700, color: st === 'Validada' ? '#065f46' : st === 'Recusada' ? '#b91c1c' : '#b45309' }}>
                    {st}
                  </td>
                  <td style={{ padding: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {st !== 'Validada' && (
                      <button
                        type="button"
                        onClick={() => atualizarStatusContaBancariaRTDB(produtoraId, contaId, 'Validada', email)}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: 0, background: '#047857', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                      >
                        Validar Conta
                      </button>
                    )}
                    {st !== 'Recusada' && (
                      <button
                        type="button"
                        onClick={() => atualizarStatusContaBancariaRTDB(produtoraId, contaId, 'Recusada', email)}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: 0, background: '#b91c1c', color: '#fff', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Recusar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => nav?.navegarPara('saldos', produtoraId)}
                      style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', color: '#1e3a8a', cursor: 'pointer', fontSize: '12px' }}
                    >
                      Ver Saldo
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <form
        onSubmit={handleCadastrarConta}
        style={{
          borderTop: '1px solid #e2e8f0',
          paddingTop: '14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '10px',
          alignItems: 'end'
        }}
      >
        <label className="lb" style={{ fontSize: '12px' }}>
          Produtora
          <input
            className="in tx"
            value={filtroProdutora || prodNova}
            onChange={e => setProdNova(e.target.value)}
            disabled={Boolean(filtroProdutora)}
            placeholder="prod_demo"
          />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Banco
          <input className="in tx" value={banco} onChange={e => setBanco(e.target.value)} placeholder="341 - Itaú" />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Agência
          <input className="in tx" value={agencia} onChange={e => setAgencia(e.target.value)} placeholder="0001" />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Conta Corrente
          <input className="in tx" value={conta} onChange={e => setConta(e.target.value)} placeholder="12345-6" />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Titular / Razão Social
          <input className="in tx" value={titular} onChange={e => setTitular(e.target.value)} placeholder="Titular CNPJ" />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          CNPJ Titular
          <input className="in tx" value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="12.345.678/0001-99" />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Chave PIX
          <input className="in tx" value={pix} onChange={e => setPix(e.target.value)} placeholder="financeiro@produtora.com.br" />
        </label>
        <button
          type="submit"
          className="btn"
          style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}
        >
          + Homologar Nova Conta
        </button>
      </form>
      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}
    </section>
  );
}

export const contasModule: FinancialModulePlugin = {
  id: 'contas',
  title: 'Contas Bancárias',
  description: 'Homologação e validação de contas bancárias e chaves PIX das produtoras integrada aos saldos.',
  rtdbNode: 'contas',
  render: (dados, sessao, nav) => <ContasBancariasView dados={dados} sessao={sessao} nav={nav} />
};
