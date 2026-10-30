import { useState } from 'react';
import { formatBRL } from '../../shared/formatters';
import type { EstadoProdutorRTDB } from '../../shared/dadosProdutor';
import { DonutChart, StackedEventsChart, SearchIconSvg, ModuleIconSvg } from '../../shared/charts';

export interface InicioProdutorProps {
  dados: EstadoProdutorRTDB;
  onNavigate: (tabId: string, eventoId?: string) => void;
}

export function InicioProdutorModule({ dados, onNavigate }: InicioProdutorProps) {
  const [q, setQ] = useState('');
  const { consolidado, eventos, repasses, contas, antecipacoes, despesas } = dados;

  const retidoTotal = eventos.reduce((acc, e) => acc + e.retido, 0);
  const jaRepassadoTotal = eventos.reduce((acc, e) => acc + e.jaRepassado, 0);
  const resultadoTotal = jaRepassadoTotal + consolidado.liberavelEventos + retidoTotal;
  const pendentesCount = repasses.filter(r => r.status === 'Solicitado').length;
  const contasValidadasCount = contas.filter(c => c.status === 'Validada').length;
  const totalVendidos = eventos.reduce((acc, e) => acc + Number(e.vendidosAtuais || 0), 0);
  const contratosCount = Object.keys(dados.contratos || {}).length || eventos.length;
  const notificacoesCount =
    Object.keys(dados.notificacoes_central || {}).length + repasses.length + antecipacoes.length;

  const cards = [
    {
      id: 'saldo',
      secao: 'caixa',
      title: 'Saldo Consolidado',
      desc: 'Saldo geral acumulado dos seus eventos e exportação de extrato CSV.',
      badge: formatBRL(consolidado.saldoDisponivel)
    },
    {
      id: 'repasses',
      secao: 'caixa',
      title: 'Solicitar Repasse',
      desc: 'Escolha os eventos liberados e solicite a transferência PIX ou TED.',
      badge: pendentesCount > 0 ? `${pendentesCount} em análise` : 'Disponível'
    },
    {
      id: 'bordero',
      secao: 'caixa',
      title: 'Demonstrativo de Borderô',
      desc: 'Cascata completa do borderô ao liberável, retenções e descontos por evento.',
      badge: `${eventos.length} evento(s)`
    },
    {
      id: 'extrato',
      secao: 'caixa',
      title: 'Extrato Consolidado',
      desc: 'Histórico unificado de liquidações, protocolos bancários e antecipações.',
      badge: `${repasses.length} repasse(s)`
    },
    {
      id: 'contas',
      secao: 'caixa',
      title: 'Contas Bancárias',
      desc: 'Cadastro, validação e escolha de conta padrão e chaves PIX.',
      badge: `${contasValidadasCount} validada(s)`
    },
    {
      id: 'antecipacoes',
      secao: 'caixa',
      title: 'Antecipações',
      desc: 'Antecipe parte do valor retido pelas travas de capacidade.',
      badge: `Teto ${dados.antecipacaoConfig.pctLimite}%`
    },
    {
      id: 'despesas',
      secao: 'caixa',
      title: 'Despesas e Deduções',
      desc: 'Custos diretos, notas fiscais, descontos operacionais e retenções.',
      badge: `${despesas.length} item(ns)`
    },
    {
      id: 'comercial-contratos',
      secao: 'erp',
      title: 'Contratos e Aditivos',
      desc: 'Versões contratuais seladas (SHA-256) e faixas de destravamento por público.',
      badge: `${contratosCount} contrato(s)`
    },
    {
      id: 'operacao-vendas',
      secao: 'erp',
      title: 'Vendas, Lotes e Ocupação',
      desc: 'Acompanhamento de ingressos comercializados, lotes e ocupação de capacidade.',
      badge: `${totalVendidos} ing.`
    },
    {
      id: 'financeiro-cobranca',
      secao: 'erp',
      title: 'Cobrança e Compensação',
      desc: 'Transparência de compensação entre eventos, adiantamentos e saldos devedores.',
      badge: consolidado.devedores > 0 ? formatBRL(consolidado.devedores) : 'Sem débitos'
    },
    {
      id: 'plataforma-notificacoes',
      secao: 'erp',
      title: 'Alertas e Notificações',
      desc: 'Comunicados automáticos de aprovação, liquidação PIX/TED e borderô.',
      badge: `${notificacoesCount} aviso(s)`
    }
  ];

  const qNorm = q.trim().toLowerCase();
  const cardsFiltrados = qNorm
    ? cards.filter(c => c.title.toLowerCase().includes(qNorm) || c.desc.toLowerCase().includes(qNorm))
    : cards;

  const cardsCaixa = cardsFiltrados.filter(c => c.secao === 'caixa');
  const cardsErp = cardsFiltrados.filter(c => c.secao === 'erp');

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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'stretch' }}>
        <section className="card" style={{ flex: '1 1 420px', minWidth: 0 }}>
          <h2 className="h2">Para onde vai o resultado dos eventos</h2>
          <DonutChart
            slices={[
              { label: 'Já recebido', v: jaRepassadoTotal, color: '#2f55c4' },
              { label: 'Liberável agora', v: consolidado.liberavelEventos, color: '#0f8a5f' },
              { label: 'Retido pelas travas', v: retidoTotal, color: '#e0661b' }
            ]}
            centerTop="Total eventos"
            centerVal={formatBRL(resultadoTotal)}
          />
        </section>
        <section className="card" style={{ flex: '1 1 460px', minWidth: 0 }}>
          <h2 className="h2">Situação por evento</h2>
          <StackedEventsChart eventos={eventos} />
        </section>
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
            const gatilhos = Array.isArray(e.faixas) && e.faixas.length > 0
              ? e.faixas.map(f => f.gatilhoPct)
              : [30, 50, 80];
            const minGatilho = gatilhos[0] || 30;
            const chip = e.faixaAtual ? `Faixa ${e.faixaAtual.liberaPct}%` : `Abaixo do gatilho (${minGatilho}%)`;
            const chipBg = e.faixaAtual ? '#dcfce7' : '#ffedd5';
            const chipFg = e.faixaAtual ? '#065f46' : '#9a3412';

            return (
              <div key={e.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', padding: '10px 0', borderTop: '1px solid #eef1f7' }}>
                <div style={{ flex: '2 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{e.nome}</div>
                  <div className="sub">{e.data}{e.local ? ` · ${e.local}` : ''}</div>
                </div>
                <span style={{ flex: '0 1 auto', fontSize: '12px', fontWeight: 800, padding: '6px 10px', borderRadius: '999px', background: chipBg, color: chipFg }}>
                  {chip}
                </span>
                <div style={{ flex: '2 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div
                    style={{ position: 'relative', height: '12px', background: '#e3e7f1', borderRadius: '999px' }}
                    title={`${pctTxt} vendido · travas em ${gatilhos.join('%, ')}%`}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        borderRadius: '999px',
                        background: '#1e3a8a',
                        width: `${Math.min(100, e.pctVendido)}%`
                      }}
                    />
                    {gatilhos.map(g => (
                      <div
                        key={g}
                        style={{
                          position: 'absolute',
                          top: '-2px',
                          bottom: '-2px',
                          width: '2px',
                          background: '#c2410c',
                          left: `${g}%`
                        }}
                      />
                    ))}
                  </div>
                  <span className="sub" style={{ fontSize: '12px' }}>{pctTxt} vendido ({e.vendidosAtuais}/{e.capacidadeUsada}) · {nextMsg}</span>
                </div>
                <span className="num" style={{ flex: '1 1 110px', textAlign: 'right', color: e.liberavel > 0 ? '#065f46' : '#5a6584' }}>
                  {formatBRL(e.liberavel)}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ background: '#eef2ff', color: '#1e3a8a', padding: '6px 12px', minHeight: '36px', fontSize: '12px' }}
                    onClick={() => onNavigate('bordero', e.id)}
                  >
                    Borderô
                  </button>
                  {e.liberavel > 0 && (
                    <button
                      type="button"
                      className="btn"
                      style={{ background: '#ecfdf5', color: '#065f46', padding: '6px 12px', minHeight: '36px', fontSize: '12px' }}
                      onClick={() => onNavigate('repasses', e.id)}
                    >
                      Repasse →
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      <label style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #dde2ee', borderRadius: '12px', overflow: 'hidden' }}>
        <span style={{ width: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5a6584' }}>
          <SearchIconSvg />
        </span>
        <input
          aria-label="Buscar módulo financeiro"
          value={q}
          onChange={ev => setQ(ev.target.value)}
          placeholder="Buscar módulo financeiro..."
          style={{ border: 0, outline: 'none', flex: 1, font: "500 16px 'Manrope', sans-serif", padding: '14px 16px 14px 0', minHeight: '52px', color: '#0f1b3d', background: 'transparent' }}
        />
      </label>

      {cardsCaixa.length > 0 && (
        <>
          <div className="grp">Operações de caixa e borderô</div>
          <div className="mods">
            {cardsCaixa.map(c => (
              <button key={c.id} className="mod" onClick={() => onNavigate(c.id)}>
                <span className="ic">
                  <ModuleIconSvg id={c.id} />
                </span>
                <span>
                  <span className="mtt">{c.title}</span>
                  <span className="mtd">{c.desc}</span>
                  {c.badge ? <span className="bdg">{c.badge}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {cardsErp.length > 0 && (
        <>
          <div className="grp">Governança, vendas e comunicados</div>
          <div className="mods">
            {cardsErp.map(c => (
              <button key={c.id} className="mod" onClick={() => onNavigate(c.id)}>
                <span className="ic">
                  <ModuleIconSvg id={c.id} />
                </span>
                <span>
                  <span className="mtt">{c.title}</span>
                  <span className="mtd">{c.desc}</span>
                  {c.badge ? <span className="bdg">{c.badge}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
