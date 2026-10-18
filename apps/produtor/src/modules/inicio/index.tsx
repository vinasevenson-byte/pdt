import { useState } from 'react';
import { formatBRL } from '../../shared/formatters';
import type { EstadoProdutorRTDB } from '../../shared/dadosProdutor';

export interface InicioProdutorProps {
  dados: EstadoProdutorRTDB;
  onNavigate: (tabId: string) => void;
}

export function InicioProdutorModule({ dados, onNavigate }: InicioProdutorProps) {
  const [q, setQ] = useState('');
  const { consolidado, eventos, repasses } = dados;

  const retidoTotal = eventos.reduce((acc, e) => acc + e.retido, 0);
  const jaRepassadoTotal = eventos.reduce((acc, e) => acc + e.jaRepassado, 0);
  const pendentesCount = repasses.filter(r => r.status === 'Solicitado').length;

  const cards = [
    {
      id: 'saldo',
      title: 'Saldo Consolidado',
      desc: 'Saldo geral acumulado dos seus eventos e exportes rápidos.',
      badge: formatBRL(consolidado.saldoDisponivel)
    },
    {
      id: 'repasses',
      title: 'Solicitar Repasse',
      desc: 'Escolha os eventos e solicite a transferência para sua conta.'
    },
    {
      id: 'contas',
      title: 'Contas Bancárias',
      desc: 'Cadastro e validação de contas correntes e chaves PIX.'
    },
    {
      id: 'antecipacoes',
      title: 'Antecipações',
      desc: 'Antecipe parte do valor retido das vendas.'
    },
    {
      id: 'despesas',
      title: 'Despesas',
      desc: 'Custos diretos, descontos operacionais e retenções do borderô.'
    }
  ];

  const qNorm = q.trim().toLowerCase();
  const cardsFiltrados = qNorm
    ? cards.filter(c => c.title.toLowerCase().includes(qNorm) || c.desc.toLowerCase().includes(qNorm))
    : cards;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="grp">Visão geral</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="kpi" style={{ border: '2px solid #047857' }}>
          <span>Saldo disponível</span>
          <span className="num" style={{ fontSize: '22px', color: '#065f46' }}>{formatBRL(consolidado.saldoDisponivel)}</span>
        </div>
        <div className="kpi">
          <span>Liberável nos eventos</span>
          <span className="num" style={{ fontSize: '20px' }}>{formatBRL(consolidado.liberavelEventos)}</span>
        </div>
        <div className="kpi">
          <span>Retido pelas travas</span>
          <span className="num" style={{ fontSize: '20px', color: '#9a3412' }}>{formatBRL(retidoTotal)}</span>
        </div>
        <div className="kpi">
          <span>Repassado até hoje</span>
          <span className="num" style={{ fontSize: '20px' }}>{formatBRL(jaRepassadoTotal)}</span>
        </div>
        <div className="kpi">
          <span>Eventos abertos</span>
          <span className="num" style={{ fontSize: '20px' }}>{eventos.length}</span>
          <span className="sub">{pendentesCount} repasse(s) em análise</span>
        </div>
      </div>

      <section className="card" style={{ gap: '10px' }}>
        <h2 className="h2">Vendas × travas de capacidade</h2>
        {eventos.length === 0 ? (
          <div className="sub">Nenhum evento disponível para esta produtora no momento.</div>
        ) : (
          eventos.map(e => {
            const pctTxt = `${e.pctVendido.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
            const nextMsg = e.proximaFaixa
              ? `Faltam ${e.proximaFaixa.ingressosFaltantes} ing. p/ ${e.proximaFaixa.gatilhoPct}%`
              : 'Faixa máxima atingida';
            const chip = e.faixaAtual ? `Faixa ${e.faixaAtual.liberaPct}%` : 'Abaixo do gatilho (30%)';
            const chipBg = e.faixaAtual ? '#dcfce7' : '#ffedd5';
            const chipFg = e.faixaAtual ? '#065f46' : '#9a3412';

            return (
              <div key={e.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', padding: '10px 0', borderTop: '1px solid #eef1f7' }}>
                <div style={{ flex: '2 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{e.nome}</div>
                  <div className="sub">{e.data}</div>
                </div>
                <span style={{ flex: '0 1 auto', fontSize: '12px', fontWeight: 800, padding: '6px 10px', borderRadius: '999px', background: chipBg, color: chipFg }}>
                  {chip}
                </span>
                <div style={{ flex: '2 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ position: 'relative', height: '12px', background: '#e3e7f1', borderRadius: '999px' }} title={`${pctTxt} vendido`}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: '999px', background: '#1e3a8a', width: `${Math.min(100, e.pctVendido)}%` }} />
                  </div>
                  <span className="sub" style={{ fontSize: '12px' }}>{pctTxt} vendido · {nextMsg}</span>
                </div>
                <span className="num" style={{ flex: '1 1 120px', textAlign: 'right', color: e.liberavel > 0 ? '#065f46' : '#5a6584' }}>
                  {formatBRL(e.liberavel)}
                </span>
              </div>
            );
          })
        )}
      </section>

      <label style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #dde2ee', borderRadius: '12px', overflow: 'hidden' }}>
        <input
          aria-label="Buscar módulo financeiro"
          value={q}
          onChange={ev => setQ(ev.target.value)}
          placeholder="Buscar módulo financeiro..."
          style={{ border: 0, outline: 'none', flex: 1, font: "500 16px 'Manrope', sans-serif", padding: '14px 16px', minHeight: '52px', color: '#0f1b3d', background: 'transparent' }}
        />
      </label>

      <div className="grp">Operações de caixa</div>
      <div className="mods">
        {cardsFiltrados.map(c => (
          <button key={c.id} className="mod" onClick={() => onNavigate(c.id)}>
            <span>
              <span className="mtt">{c.title}</span>
              <span className="mtd">{c.desc}</span>
              {c.badge ? <span className="bdg">{c.badge}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
