import { useState, useEffect } from 'react';
import type { FinancialModulePlugin, FinancialModuleNavContext } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import {
  salvarConfiguracaoEventoTravasRTDB,
  type EstadoFinanceiroRTDB,
  type SessaoFinanceiro
} from '../../shared/firebaseFinanceiro';
import {
  normalizarLocalUI,
  normalizarEventoUI,
  normalizarEventoFinUI,
  normalizarNegociacaoUI,
  calcularEventoUI,
  simularVendasEventoUI,
  type EventoUI,
  type EventoFinUI,
  type NegociacaoUI
} from './calcularEventoETravas';

export type TelaEventosTravasId =
  | 'todas'
  | 'cascata'
  | 'simulador'
  | 'capacidade'
  | 'bordero'
  | 'taxas_disk'
  | 'retencoes'
  | 'descontos_op'
  | 'creditos'
  | 'regras_faixas'
  | 'pdf';

export const MENU_TELAS_EVENTOS_TRAVAS: Array<{ id: TelaEventosTravasId; label: string; badge?: string }> = [
  { id: 'todas', label: 'Visão Consolidada (7 Seções)' },
  { id: 'cascata', label: 'Cascata do Cálculo' },
  { id: 'simulador', label: '🔮 Simulador "E se?"' },
  { id: 'capacidade', label: '1. Local e Capacidade' },
  { id: 'bordero', label: '2. Borderô e Despesas' },
  { id: 'taxas_disk', label: '3. Taxas Disk' },
  { id: 'retencoes', label: '4. Retenções (ISS/ECAD/Loc.)' },
  { id: 'descontos_op', label: '5. Descontos Operacionais' },
  { id: 'creditos', label: '6. Créditos (Rebate/Patroc.)' },
  { id: 'regras_faixas', label: '7. Regra de Travas e Faixas' },
  { id: 'pdf', label: '📄 Fechamento / PDF' }
];

function formatPct(n: number): string {
  return `${Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function EventosTravasWorkspace({
  dados,
  sessao,
  nav
}: {
  dados?: EstadoFinanceiroRTDB;
  sessao?: SessaoFinanceiro | null;
  nav?: FinancialModuleNavContext;
}) {
  const eventosRaw = dados?.eventos || {};
  const eventosFinRaw = dados?.eventosFin || {};
  const negociacoesRaw = dados?.negociacoes || {};
  const locaisRaw = dados?.locais || {};
  const produtorasRaw = dados?.produtoras || {};
  const despesasRaw = dados?.despesas || {};
  const advancedRaw = dados?.advanced || {};
  const antecipacoesRaw = dados?.antecipacoes || {};

  const idsEventos = Object.keys(eventosRaw);
  const [evIdAtivo, setEvIdAtivo] = useState<string>(idsEventos[0] || 'polaquedo');
  const [telaAtiva, setTelaAtiva] = useState<TelaEventosTravasId>('todas');

  const idSelecionado = eventosRaw[evIdAtivo] ? evIdAtivo : idsEventos[0] || 'polaquedo';
  const rawEv = (eventosRaw[idSelecionado] || {}) as Record<string, unknown>;
  const localAtual = normalizarLocalUI((locaisRaw[String(rawEv.localId || 'loc_polaquedo')] || {}) as Record<string, unknown>);

  const [evEdit, setEvEdit] = useState<EventoUI>(() => normalizarEventoUI(idSelecionado, rawEv, localAtual));
  const [finEdit, setFinEdit] = useState<EventoFinUI>(() =>
    normalizarEventoFinUI((eventosFinRaw[idSelecionado] || {}) as Record<string, unknown>)
  );
  const [negEdit, setNegEdit] = useState<NegociacaoUI>(() =>
    normalizarNegociacaoUI((negociacoesRaw[idSelecionado] || {}) as Record<string, unknown>)
  );

  const [simIngressos, setSimIngressos] = useState<number>(evEdit.vendas.vendidos);
  const [simMetaValor, setSimMetaValor] = useState<number>(5000);
  const [bannerSalvo, setBannerSalvo] = useState<string | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  useEffect(() => {
    const rEv = (eventosRaw[idSelecionado] || {}) as Record<string, unknown>;
    const loc = normalizarLocalUI((locaisRaw[String(rEv.localId || 'loc_polaquedo')] || {}) as Record<string, unknown>);
    const novoEv = normalizarEventoUI(idSelecionado, rEv, loc);
    const novoFin = normalizarEventoFinUI((eventosFinRaw[idSelecionado] || {}) as Record<string, unknown>);
    const novoNeg = normalizarNegociacaoUI((negociacoesRaw[idSelecionado] || {}) as Record<string, unknown>);
    setEvEdit(novoEv);
    setFinEdit(novoFin);
    setNegEdit(novoNeg);
    setSimIngressos(novoEv.vendas.vendidos);
    setBannerSalvo(null);
    setErroSalvar(null);
  }, [idSelecionado, dados?.carregado]);

  const despEv = Object.values(despesasRaw).filter(d => d && d.eventoId === idSelecionado);
  const advEv = Object.values(advancedRaw).filter(a => a && a.escopo === idSelecionado);
  const antEv = Object.values(antecipacoesRaw).filter(a => a && a.eventoId === idSelecionado);

  const c = calcularEventoUI(evEdit, finEdit, negEdit, despEv, advEv, antEv, localAtual);
  const simResult = simularVendasEventoUI(
    evEdit,
    finEdit,
    negEdit,
    despEv,
    advEv,
    antEv,
    localAtual,
    simIngressos,
    simMetaValor
  );

  const prodAtual = (produtorasRaw[evEdit.produtoraId] || {
    nome: evEdit.produtoraId,
    cnpj: '14.890.321/0001-55'
  }) as Record<string, unknown>;

  async function handleSalvarAlteracoes() {
    setErroSalvar(null);
    setBannerSalvo(null);
    try {
      const resumo = `Bilheteria ${formatBRL(evEdit.bilheteria)} (${evEdit.vendas.vendidos} ing.); Taxa Adm ${finEdit.taxaAdm.percentual}%; Regra ${finEdit.regra.modo} (${finEdit.regra.pctResultado}% resultado, D+${finEdit.regra.liberaTotalDmais} dias úteis).`;
      await salvarConfiguracaoEventoTravasRTDB({
        eventoId: idSelecionado,
        eventoPatch: {
          nome: evEdit.nome,
          data: evEdit.data,
          produtoraId: evEdit.produtoraId,
          localId: evEdit.localId,
          liberadoParaSolicitacao: evEdit.liberadoParaSolicitacao,
          capacidade: evEdit.capacidade,
          vendas: evEdit.vendas,
          bilheteria: evEdit.bilheteria,
          jaRepassado: evEdit.jaRepassado
        },
        eventoFin: finEdit as unknown as Record<string, unknown>,
        negociacao: negEdit as unknown as Record<string, unknown>,
        usuarioEmail: sessao?.email || 'financeiro@diskingressos.com.br',
        resumoAuditoria: resumo
      });
      setBannerSalvo('✓ Configuração salva e registrada na Trilha de Auditoria!');
    } catch (err) {
      setErroSalvar(err instanceof Error ? err.message : 'Erro ao salvar configuração do evento.');
    }
  }

  function toggleSetorAberto(nomeSetor: string, checked: boolean) {
    setEvEdit(prev => {
      const atuais = prev.capacidade.setoresAbertos || [];
      const novos = checked ? Array.from(new Set([...atuais, nomeSetor])) : atuais.filter(s => s !== nomeSetor);
      return { ...prev, capacidade: { ...prev.capacidade, setoresAbertos: novos } };
    });
  }

  function adicionarRetencao() {
    setFinEdit(prev => ({
      ...prev,
      retencoes: [
        ...prev.retencoes,
        {
          id: `ret_${Date.now()}`,
          nome: 'Nova Retenção',
          ativo: true,
          tipo: 'fixo',
          base: 'bruto',
          percentual: 0,
          valorFixo: 500,
          valorUnitario: 0,
          responsavel: 'disk',
          status: 'provisionado'
        }
      ]
    }));
  }

  function adicionarDescontoOp() {
    setFinEdit(prev => ({
      ...prev,
      descontosOperacionais: [
        ...prev.descontosOperacionais,
        {
          id: `op_${Date.now()}`,
          nome: 'Item Operacional',
          ativo: true,
          quantidade: 1,
          valorUnitario: 200
        }
      ]
    }));
  }

  function adicionarFaixa() {
    setFinEdit(prev => ({
      ...prev,
      regra: {
        ...prev.regra,
        faixas: [...prev.regra.faixas, { gatilhoPct: 90, liberaPct: 85 }]
      }
    }));
  }

  function removerFaixa(idx: number) {
    setFinEdit(prev => ({
      ...prev,
      regra: {
        ...prev.regra,
        faixas: prev.regra.faixas.filter((_, i) => i !== idx)
      }
    }));
  }

  const waterfallRows = [
    { label: 'Bilheteria (sem conv.)', kind: 'start', v: c.bil, cor: '#1e3a8a' },
    { label: 'Taxa Disk (adm + op)', kind: 'dec', v: c.taxaAdm + c.taxaOp, cor: '#7c3aed' },
    { label: 'Borderô do evento', kind: 'total', v: c.bil - c.taxaAdm - c.taxaOp, cor: '#1e3a8a' },
    { label: `Despesas (${c.abaterDespesasAPagar ? 'Pagas + A pagar' : 'Só Pagas'})`, kind: 'dec', v: c.despesas, cor: '#b91c1c' },
    { label: 'Retenções (ISS/ECAD/Loc.)', kind: 'dec', v: c.totRetencoes + c.reserva, cor: '#d97706' },
    { label: 'Descontos operacionais', kind: 'dec', v: c.totOps, cor: '#b91c1c' },
    { label: 'Resultado líquido', kind: 'total', v: Math.max(0, c.resultado), cor: '#1e3a8a' },
    { label: 'Créditos (rebate + patroc.)', kind: 'inc', v: c.creditos, cor: '#047857' },
    { label: 'Retido pelas travas', kind: 'dec', v: c.retido, cor: '#c2410c' },
    { label: 'Já repassado + antec./adv.', kind: 'dec', v: c.jaRepassado + c.advEv + c.antEv, cor: '#2563eb' },
    { label: 'Liberável agora', kind: 'total', v: c.liberavel, cor: '#047857' }
  ];
  const maxWaterfall = Math.max(1, c.bil, ...waterfallRows.map(w => Math.abs(w.v)));

  const exibirSecao = (alvo: TelaEventosTravasId) => telaAtiva === 'todas' || telaAtiva === alvo;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Barra Superior: Seletor de Eventos e Ações Globais */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#3d4766', marginRight: '4px' }}>Evento:</span>
          {idsEventos.map(eid => {
            const evItem = (eventosRaw[eid] || {}) as Record<string, unknown>;
            const locItem = normalizarLocalUI((locaisRaw[String(evItem.localId || '')] || {}) as Record<string, unknown>);
            const evNorm = normalizarEventoUI(eid, evItem, locItem);
            const finNorm = normalizarEventoFinUI((eventosFinRaw[eid] || {}) as Record<string, unknown>);
            const negNorm = normalizarNegociacaoUI((negociacoesRaw[eid] || {}) as Record<string, unknown>);
            const calcItem = calcularEventoUI(evNorm, finNorm, negNorm, [], [], [], locItem);
            const ativo = eid === idSelecionado;
            return (
              <button
                key={eid}
                type="button"
                onClick={() => setEvIdAtivo(eid)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: ativo ? '2px solid #1e3a8a' : '1px solid #cbd5e1',
                  background: ativo ? '#1e3a8a' : '#fff',
                  color: ativo ? '#fff' : '#0f1b3d',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {evNorm.nome} ({formatPct(calcItem.pctVendido)})
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {bannerSalvo && (
            <span style={{ background: '#dcfce7', color: '#065f46', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 800 }}>
              {bannerSalvo}
            </span>
          )}
          {erroSalvar && (
            <span style={{ background: '#fef2f2', color: '#b91c1c', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 800 }}>
              {erroSalvar}
            </span>
          )}
          <button
            type="button"
            className="btn"
            onClick={handleSalvarAlteracoes}
            style={{ background: '#047857', color: '#fff', minHeight: '38px', fontSize: '13px' }}
          >
            💾 Salvar alterações (com Auditoria)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setTelaAtiva('pdf')}
            style={{ background: '#eef2ff', color: '#1e3a8a', border: '1px solid #1e3a8a', minHeight: '38px', fontSize: '13px' }}
          >
            📄 Emitir Borderô / Fechamento (PDF)
          </button>
        </div>
      </div>

      {/* Menu Dedicado de Telas de Eventos e Travas */}
      <nav
        aria-label="Submenu de telas de Eventos e Travas"
        style={{
          background: '#fff',
          border: '1px solid #dde2ee',
          borderRadius: '12px',
          padding: '8px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          alignItems: 'center'
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginRight: '6px' }}>
          Telas de Eventos e Travas:
        </span>
        {MENU_TELAS_EVENTOS_TRAVAS.map(item => {
          const on = telaAtiva === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTelaAtiva(item.id)}
              style={{
                padding: '7px 12px',
                borderRadius: '8px',
                border: on ? '1px solid #1e3a8a' : '1px solid transparent',
                background: on ? '#1e3a8a' : '#f1f5f9',
                color: on ? '#fff' : '#1e293b',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer'
              }}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* TELA DE FECHAMENTO OFICIAL / PDF */}
      {telaAtiva === 'pdf' && (
        <section className="card" style={{ border: '2px solid #1e3a8a', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #dde2ee' }}>
            <span style={{ fontWeight: 800, color: '#1e3a8a' }}>📄 Fechamento Oficial de Borderô (Pré-visualização / PDF)</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => typeof window !== 'undefined' && window.print()}
                style={{ background: '#1e3a8a', color: '#fff', minHeight: '36px', fontSize: '13px' }}
              >
                🖨️ Imprimir / Salvar PDF
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setTelaAtiva('todas')}
                style={{ background: '#e2e8f0', color: '#0f172a', minHeight: '36px', fontSize: '13px' }}
              >
                ← Voltar às 7 Seções
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #1e3a8a', paddingBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                DiskIngressos · Fechamento Oficial de Borderô (Financeiro)
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f1b3d' }}>{evEdit.nome}</div>
              <div className="sub">
                {String(prodAtual.nome || evEdit.produtoraId)} ({String(prodAtual.cnpj || '')}) · Local: {localAtual.nome} · Data: {evEdit.data}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="sub">Ocupação: {c.ingressosContados}/{c.capacidadeUsada} ({formatPct(c.pctVendido)})</div>
              <div style={{ fontWeight: 800, color: '#065f46', marginTop: '4px' }}>
                Regra: {c.modo} · Liberação 100% em {c.dataLiberacaoTotal} (D+{c.liberaTotalDmais})
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Bilheteria Bruta (sem conveniência)</span>
              <strong>{formatBRL(c.bil)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>(−) Taxa Administrativa Disk ({finEdit.taxaAdm.percentual}%)</span>
              <strong>{formatBRL(-c.taxaAdm)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>(−) Taxa Operacional Negociada ({negEdit.taxaOp.tipo})</span>
              <strong>{formatBRL(-c.taxaOp)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '6px', fontWeight: 800 }}>
              <span>(=) Borderô Líquido do Evento</span>
              <span>{formatBRL(c.bil - c.taxaAdm - c.taxaOp)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>(−) Despesas Lançadas (Pago: {formatBRL(c.despesasPagas)} / A pagar: {formatBRL(c.despesasAPagar)})</span>
              <strong>{formatBRL(-c.despesas)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>(−) Retenções Provisionadas (ISS, ECAD, Locação e Outras)</span>
              <strong>{formatBRL(-c.totRetencoes)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>(−) Descontos Operacionais (Equipe/Estrutura)</span>
              <strong>{formatBRL(-c.totOps)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '6px', fontWeight: 800 }}>
              <span>(=) Resultado Líquido do Evento</span>
              <span>{formatBRL(c.resultado)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>(=) Escolhido pelas Travas ({c.modo}: Regra A {formatBRL(c.A)} vs Regra B {formatBRL(c.B)})</span>
              <strong>{formatBRL(c.escolhido)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#065f46' }}>
              <span>(+) Créditos Comerciais (Rebate + Patrocínio)</span>
              <strong>{formatBRL(c.creditos)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>(−) Já Repassado / Antecipações / Advanced</span>
              <strong>{formatBRL(-(c.jaRepassado + c.advEv + c.antEv))}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #047857', paddingTop: '10px', fontSize: '17px', fontWeight: 800, color: '#065f46' }}>
              <span>(=) Saldo Liberável Atual do Evento</span>
              <span>{formatBRL(c.liberavel)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9a3412', fontWeight: 700 }}>
              <span>Valor Retido pelas Travas (Liberação 100% em {c.dataLiberacaoTotal} — D+{c.liberaTotalDmais} dias úteis)</span>
              <span>{formatBRL(c.retido)}</span>
            </div>
          </div>
        </section>
      )}

      {/* CASCATA DO CÁLCULO AO VIVO (WATERFALL) */}
      {exibirSecao('cascata') && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <h2 className="h2" style={{ margin: 0 }}>Cascata do cálculo · {evEdit.nome}</h2>
            <p className="sub" style={{ margin: '4px 0 0' }}>Atualiza ao vivo enquanto você edita qualquer parâmetro nas 7 seções de travas e borderô.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {waterfallRows.map(w => {
              const pctBarra = Math.min(100, Math.max(2, (Math.abs(w.v) / maxWaterfall) * 100));
              const prefix = w.kind === 'dec' ? '− ' : w.kind === 'inc' ? '+ ' : '';
              return (
                <div key={w.label} style={{ display: 'grid', gridTemplateColumns: '240px 1fr 130px', gap: '12px', alignItems: 'center', fontSize: '13px' }}>
                  <span style={{ fontWeight: w.kind === 'total' || w.kind === 'start' ? 800 : 600 }}>{w.label}</span>
                  <div style={{ height: '14px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${pctBarra}%`, height: '100%', background: w.cor, borderRadius: '999px' }} />
                  </div>
                  <span className="num" style={{ textAlign: 'right', fontWeight: 800, color: w.cor }}>
                    {prefix}{formatBRL(w.v)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SIMULADOR WHAT-IF ("E SE?") */}
      {exibirSecao('simulador') && (
        <section className="card" style={{ border: '2px solid #c2410c', background: '#fffaf5', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 className="h2" style={{ color: '#9a3412', margin: 0 }}>
                🔮 Simulador &quot;E se?&quot; (What-If) de Vendas e Destravamento · {evEdit.nome}
              </h2>
              <p className="sub" style={{ margin: '4px 0 0' }}>
                Simule o impacto de novos ingressos vendidos no destravamento de faixas de capacidade, resultado e saldo liberável (ticket médio atual:{' '}
                <strong className="num">{formatBRL(simResult.ticketMedio)}</strong>).
              </p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => setSimIngressos(evEdit.vendas.vendidos)}
              style={{ background: '#ffedd5', color: '#9a3412', minHeight: '34px', fontSize: '12px' }}
            >
              ↺ Resetar p/ vendas reais ({evEdit.vendas.vendidos} ing.)
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', alignItems: 'end' }}>
            <label className="lb">
              Simular quantidade de ingressos vendidos (0 a {c.capacidadeUsada})
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                <input
                  type="range"
                  min={0}
                  max={c.capacidadeUsada}
                  value={simIngressos}
                  onChange={e => setSimIngressos(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#c2410c' }}
                />
                <input
                  className="in"
                  style={{ width: '110px' }}
                  type="number"
                  min={0}
                  max={c.capacidadeUsada}
                  value={simIngressos}
                  onChange={e => setSimIngressos(Number(e.target.value || 0))}
                />
              </div>
            </label>
            <label className="lb">
              Meta de valor liberável desejado (R$)
              <input
                className="in"
                type="number"
                step={500}
                value={simMetaValor}
                onChange={e => setSimMetaValor(Number(e.target.value || 0))}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div className="kpi">
              <span>Ocupação Simulada</span>
              <span className="num" style={{ fontSize: '18px' }}>
                {simResult.vendidosSimulados} / {c.capacidadeUsada} ({formatPct(simResult.simulacao.pctVendido)})
              </span>
              <span className="sub">
                {simResult.ingressosAdicionais >= 0 ? `+${simResult.ingressosAdicionais} ing. vs atual` : `${simResult.ingressosAdicionais} ing. vs atual`}
              </span>
            </div>
            <div className="kpi">
              <span>Bilheteria Projetada</span>
              <span className="num" style={{ fontSize: '18px' }}>{formatBRL(simResult.bilheteriaSimulada)}</span>
              <span className="sub">
                Faixa: {simResult.simulacao.faixaAtual ? `${simResult.simulacao.faixaAtual.gatilhoPct}% → libera ${simResult.simulacao.faixaAtual.liberaPct}%` : 'Abaixo do 1º gatilho'}
              </span>
            </div>
            <div className="kpi" style={{ border: '2px solid #047857' }}>
              <span>Liberável Projetado</span>
              <span className="num" style={{ fontSize: '18px', color: '#065f46' }}>{formatBRL(simResult.simulacao.liberavel)}</span>
              <span className="sub">
                Diferença: {simResult.ganhoLiberavel >= 0 ? `+ ${formatBRL(simResult.ganhoLiberavel)}` : formatBRL(simResult.ganhoLiberavel)}
              </span>
            </div>
            <div className="kpi" style={{ background: '#eef2ff', borderColor: '#c7d2fe' }}>
              <span>Meta: Liberar {formatBRL(simMetaValor)}</span>
              <span className="num" style={{ fontSize: '15px', color: '#1e3a8a' }}>
                {simResult.meta
                  ? simResult.meta.atingivel
                    ? simResult.meta.ingressosFaltantes === 0
                      ? '✓ Já atingida hoje!'
                      : `Faltam +${simResult.meta.ingressosFaltantes} ingressos`
                    : 'Acima do teto máximo (100% cap.)'
                  : '—'}
              </span>
              <span className="sub">
                {simResult.meta && simResult.meta.atingivel
                  ? `Total necessário: ${simResult.meta.vendidosNecessarios} ing. (${formatPct(simResult.meta.pctCapacidadeNecessaria)})`
                  : 'Mesmo com lotação máxima não atinge antes de D+2'}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* CORPO PRINCIPAL (7 SEÇÕES À ESQUERDA + PRÉVIA LINHA A LINHA À DIREITA) */}
      {telaAtiva !== 'pdf' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
          <div style={{ flex: '999 1 680px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* 1. Local e Capacidade */}
            {exibirSecao('capacidade') && (
              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h2 className="h2" style={{ margin: 0 }}>
                  1. Local e capacidade ({localAtual.nome} · Cap. Total: {localAtual.capacidadeTotal})
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <label className="lb">
                    Modo de capacidade
                    <select
                      className="in tx"
                      value={evEdit.capacidade.modo}
                      onChange={e =>
                        setEvEdit(p => ({
                          ...p,
                          capacidade: { ...p.capacidade, modo: e.target.value as 'local' | 'setores' | 'manual' }
                        }))
                      }
                    >
                      <option value="local">Capacidade total do local ({localAtual.capacidadeTotal})</option>
                      <option value="setores">Apenas setores abertos</option>
                      <option value="manual">Capacidade manual</option>
                    </select>
                  </label>
                  {evEdit.capacidade.modo === 'manual' && (
                    <label className="lb">
                      Capacidade manual
                      <input
                        className="in"
                        type="number"
                        value={evEdit.capacidade.manual}
                        onChange={e =>
                          setEvEdit(p => ({
                            ...p,
                            capacidade: { ...p.capacidade, manual: Number(e.target.value || 0) }
                          }))
                        }
                      />
                    </label>
                  )}
                  <label className="lb">
                    Ingressos vendidos
                    <input
                      className="in"
                      type="number"
                      value={evEdit.vendas.vendidos}
                      onChange={e =>
                        setEvEdit(p => ({
                          ...p,
                          vendas: { ...p.vendas, vendidos: Number(e.target.value || 0) }
                        }))
                      }
                    />
                  </label>
                  <label className="lb">
                    Cortesias emitidas
                    <input
                      className="in"
                      type="number"
                      value={evEdit.vendas.cortesias}
                      onChange={e =>
                        setEvEdit(p => ({
                          ...p,
                          vendas: { ...p.vendas, cortesias: Number(e.target.value || 0) }
                        }))
                      }
                    />
                  </label>
                </div>

                {evEdit.capacidade.modo === 'setores' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', padding: '12px', background: '#f4f6fb', borderRadius: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#3d4766' }}>Setores abertos:</span>
                    {localAtual.setores.map(s => {
                      const checked = evEdit.capacidade.setoresAbertos.includes(s.nome);
                      return (
                        <label key={s.nome} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                          <input type="checkbox" checked={checked} onChange={e => toggleSetorAberto(s.nome, e.target.checked)} />
                          {s.nome} ({s.capacidade} lug.)
                        </label>
                      );
                    })}
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={evEdit.capacidade.contarCortesias}
                    onChange={e =>
                      setEvEdit(p => ({
                        ...p,
                        capacidade: { ...p.capacidade, contarCortesias: e.target.checked }
                      }))
                    }
                  />
                  Contar cortesias no cálculo de % de capacidade vendida
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700 }}>
                    <span>
                      Ocupação considerada: {c.ingressosContados} / {c.capacidadeUsada} lugares ({formatPct(c.pctVendido)})
                    </span>
                    <span style={{ color: '#c2410c' }}>
                      {c.proximaFaixa
                        ? `Faltam ${c.proximaFaixa.ingressosFaltantes} ingressos para ${c.proximaFaixa.gatilhoPct}% (libera ${c.proximaFaixa.liberaPct}%)`
                        : 'Faixa máxima atingida'}
                    </span>
                  </div>
                  <div style={{ position: 'relative', height: '14px', background: '#e3e7f1', borderRadius: '999px' }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        borderRadius: '999px',
                        background: '#1e3a8a',
                        width: `${Math.min(100, c.pctVendido).toFixed(1)}%`
                      }}
                    />
                    {c.faixas.map(f => (
                      <div
                        key={f.gatilhoPct}
                        title={`Faixa ${f.gatilhoPct}% → libera ${f.liberaPct}%`}
                        style={{
                          position: 'absolute',
                          top: '-3px',
                          width: '2px',
                          height: '20px',
                          background: '#c2410c',
                          left: `${Math.min(100, f.gatilhoPct)}%`
                        }}
                      />
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* 2. Borderô */}
            {exibirSecao('bordero') && (
              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h2 className="h2" style={{ margin: 0 }}>2. Borderô</h2>
                <div style={{ background: '#eff6ff', color: '#1e3a8a', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
                  ℹ️ A taxa de conveniência é paga pelo cliente à parte: não entra na bilheteria e não é descontada do borderô.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <label className="lb">
                    Bilheteria (R$)
                    <input
                      className="in"
                      type="number"
                      step={100}
                      value={evEdit.bilheteria}
                      onChange={e => setEvEdit(p => ({ ...p, bilheteria: Number(e.target.value || 0) }))}
                    />
                  </label>
                  <div className="lb">
                    Despesas abatidas (somente leitura)
                    <div className="in" style={{ background: '#f4f6fb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span>
                        {formatBRL(c.despesas)}{' '}
                        <span className="sub" style={{ fontSize: '11px' }}>
                          (Pago: {formatBRL(c.despesasPagas)} · A pagar: {formatBRL(c.despesasAPagar)})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => nav?.navegarPara('despesas', evEdit.produtoraId)}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #1e3a8a', background: '#eef2ff', color: '#1e3a8a', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                      >
                        Despesas →
                      </button>
                    </div>
                  </div>
                  <label className="lb">
                    Já repassado (R$)
                    <input
                      className="in"
                      type="number"
                      step={100}
                      value={evEdit.jaRepassado}
                      onChange={e => setEvEdit(p => ({ ...p, jaRepassado: Number(e.target.value || 0) }))}
                    />
                  </label>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={finEdit.regra.abaterDespesasAPagar}
                    onChange={e =>
                      setFinEdit(p => ({
                        ...p,
                        regra: { ...p.regra, abaterDespesasAPagar: e.target.checked }
                      }))
                    }
                  />
                  Abater TODAS as despesas lançadas no evento (status &quot;Pago&quot; + &quot;A pagar&quot;)
                </label>
              </section>
            )}

            {/* 3. Taxas Disk */}
            {exibirSecao('taxas_disk') && (
              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h2 className="h2" style={{ margin: 0 }}>3. Taxas Disk (Exclusivo Financeiro)</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                  <div style={{ border: '1px solid #dde2ee', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={finEdit.taxaAdm.ativo}
                        onChange={e => setFinEdit(p => ({ ...p, taxaAdm: { ...p.taxaAdm, ativo: e.target.checked } }))}
                      />
                      Aplicar Taxa Administrativa Disk
                    </label>
                    <label className="lb">
                      % Taxa Adm sobre bilheteria
                      <input
                        className="in"
                        type="number"
                        step={0.5}
                        value={finEdit.taxaAdm.percentual}
                        onChange={e => setFinEdit(p => ({ ...p, taxaAdm: { ...p.taxaAdm, percentual: Number(e.target.value || 0) } }))}
                      />
                    </label>
                    <div className="sub">
                      Taxa Adm Bruta: <strong className="num">{formatBRL(c.taxaAdm)}</strong> − Rebate (<span className="num">{formatBRL(c.rebate)}</span>) − Patrocínio (<span className="num">{formatBRL(c.patrocinio)}</span>) ={' '}
                      <strong className="num" style={{ color: '#7c3aed' }}>Taxa Adm Líquida: {formatBRL(c.taxaAdmLiquida)}</strong>
                    </div>
                  </div>

                  <div style={{ border: '1px solid #dde2ee', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#f4f6fb' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '14px' }}>Taxa Operacional (Negociações)</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                        <select
                          className="in tx"
                          value={negEdit.taxaOp.tipo}
                          onChange={e =>
                            setNegEdit(p => ({
                              ...p,
                              taxaOp: { ...p.taxaOp, tipo: e.target.value as NegociacaoUI['taxaOp']['tipo'] }
                            }))
                          }
                        >
                          <option value="porIngresso">R$ por Ingresso</option>
                          <option value="percentual">% sobre Bilheteria</option>
                          <option value="fixo">R$ Fixo</option>
                        </select>
                        <input
                          className="in"
                          type="number"
                          step={0.5}
                          value={negEdit.taxaOp.valor}
                          onChange={e =>
                            setNegEdit(p => ({
                              ...p,
                              taxaOp: { ...p.taxaOp, valor: Number(e.target.value || 0) }
                            }))
                          }
                        />
                      </div>
                      <div className="num" style={{ fontSize: '20px', color: '#7c3aed', marginTop: '10px', fontWeight: 800 }}>
                        Total Taxa Op: {formatBRL(c.taxaOp)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => nav?.navegarPara('negociacoes', evEdit.produtoraId)}
                      style={{ alignSelf: 'flex-start', marginTop: '10px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #1e3a8a', background: '#fff', color: '#1e3a8a', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                    >
                      Abrir Negociações →
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* 4. Retenções */}
            {exibirSecao('retencoes') && (
              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h2 className="h2" style={{ margin: 0 }}>4. Retenções (ISS, ECAD, Locação e Outras)</h2>
                    <p className="sub" style={{ margin: '4px 0 0' }}>
                      Desconta do repasse somente quando Ativo + Responsável = Disk + Status = Provisionado.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={adicionarRetencao}
                    className="btn"
                    style={{ background: '#eef2ff', color: '#1e3a8a', border: '1px solid #1e3a8a', minHeight: '34px', fontSize: '12px' }}
                  >
                    + Outra retenção
                  </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                        <th style={{ padding: '6px' }}>Ativo</th>
                        <th style={{ padding: '6px' }}>Nome</th>
                        <th style={{ padding: '6px' }}>Tipo</th>
                        <th style={{ padding: '6px' }}>Base</th>
                        <th style={{ padding: '6px' }}>Parâmetros</th>
                        <th style={{ padding: '6px' }}>Resp.</th>
                        <th style={{ padding: '6px' }}>Status</th>
                        <th style={{ padding: '6px', textAlign: 'right' }}>Desconto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finEdit.retencoes.map((r, idx) => {
                        const det = c.retencoesDetalhe[idx] || { valor: 0 };
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '6px' }}>
                              <input
                                type="checkbox"
                                checked={r.ativo}
                                onChange={e =>
                                  setFinEdit(p => {
                                    const list = [...p.retencoes];
                                    list[idx] = { ...list[idx], ativo: e.target.checked };
                                    return { ...p, retencoes: list };
                                  })
                                }
                              />
                            </td>
                            <td style={{ padding: '6px' }}>
                              <input
                                className="in tx"
                                style={{ minWidth: '100px', padding: '4px 8px', minHeight: '32px' }}
                                value={r.nome}
                                onChange={e =>
                                  setFinEdit(p => {
                                    const list = [...p.retencoes];
                                    list[idx] = { ...list[idx], nome: e.target.value };
                                    return { ...p, retencoes: list };
                                  })
                                }
                              />
                            </td>
                            <td style={{ padding: '6px' }}>
                              <select
                                className="in tx"
                                style={{ padding: '4px 8px', minHeight: '32px' }}
                                value={r.tipo}
                                onChange={e =>
                                  setFinEdit(p => {
                                    const list = [...p.retencoes];
                                    list[idx] = { ...list[idx], tipo: e.target.value as typeof r.tipo };
                                    return { ...p, retencoes: list };
                                  })
                                }
                              >
                                <option value="percentual">% Percentual</option>
                                <option value="fixo">R$ Fixo</option>
                                <option value="maiorEntre">Maior entre</option>
                                <option value="porIngresso">R$/Ingresso</option>
                                <option value="porCapacidade">R$/Capacidade</option>
                              </select>
                            </td>
                            <td style={{ padding: '6px' }}>
                              <select
                                className="in tx"
                                style={{ padding: '4px 8px', minHeight: '32px' }}
                                value={r.base}
                                onChange={e =>
                                  setFinEdit(p => {
                                    const list = [...p.retencoes];
                                    list[idx] = { ...list[idx], base: e.target.value as typeof r.base };
                                    return { ...p, retencoes: list };
                                  })
                                }
                              >
                                <option value="bruto">Bruto</option>
                                <option value="liquido">Líquido</option>
                              </select>
                            </td>
                            <td style={{ padding: '6px' }}>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {(r.tipo === 'percentual' || r.tipo === 'maiorEntre') && (
                                  <input
                                    className="in"
                                    style={{ width: '70px', padding: '4px', minHeight: '32px' }}
                                    type="number"
                                    placeholder="%"
                                    value={r.percentual}
                                    onChange={e =>
                                      setFinEdit(p => {
                                        const list = [...p.retencoes];
                                        list[idx] = { ...list[idx], percentual: Number(e.target.value || 0) };
                                        return { ...p, retencoes: list };
                                      })
                                    }
                                  />
                                )}
                                {(r.tipo === 'fixo' || r.tipo === 'maiorEntre') && (
                                  <input
                                    className="in"
                                    style={{ width: '88px', padding: '4px', minHeight: '32px' }}
                                    type="number"
                                    placeholder="R$ Fixo"
                                    value={r.valorFixo}
                                    onChange={e =>
                                      setFinEdit(p => {
                                        const list = [...p.retencoes];
                                        list[idx] = { ...list[idx], valorFixo: Number(e.target.value || 0) };
                                        return { ...p, retencoes: list };
                                      })
                                    }
                                  />
                                )}
                                {(r.tipo === 'porIngresso' || r.tipo === 'porCapacidade') && (
                                  <input
                                    className="in"
                                    style={{ width: '80px', padding: '4px', minHeight: '32px' }}
                                    type="number"
                                    placeholder="R$ Unit"
                                    value={r.valorUnitario}
                                    onChange={e =>
                                      setFinEdit(p => {
                                        const list = [...p.retencoes];
                                        list[idx] = { ...list[idx], valorUnitario: Number(e.target.value || 0) };
                                        return { ...p, retencoes: list };
                                      })
                                    }
                                  />
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '6px' }}>
                              <select
                                className="in tx"
                                style={{ padding: '4px 8px', minHeight: '32px' }}
                                value={r.responsavel}
                                onChange={e =>
                                  setFinEdit(p => {
                                    const list = [...p.retencoes];
                                    list[idx] = { ...list[idx], responsavel: e.target.value as typeof r.responsavel };
                                    return { ...p, retencoes: list };
                                  })
                                }
                              >
                                <option value="disk">Disk</option>
                                <option value="produtor">Produtor</option>
                              </select>
                            </td>
                            <td style={{ padding: '6px' }}>
                              <select
                                className="in tx"
                                style={{ padding: '4px 8px', minHeight: '32px' }}
                                value={r.status}
                                onChange={e =>
                                  setFinEdit(p => {
                                    const list = [...p.retencoes];
                                    list[idx] = { ...list[idx], status: e.target.value as typeof r.status };
                                    return { ...p, retencoes: list };
                                  })
                                }
                              >
                                <option value="provisionado">Provisionado</option>
                                <option value="pago">Pago</option>
                              </select>
                            </td>
                            <td className="num" style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>
                              {formatBRL(det.valor)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* 5. Descontos Operacionais */}
            {exibirSecao('descontos_op') && (
              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className="h2" style={{ margin: 0 }}>5. Descontos operacionais (Total: {formatBRL(c.totOps)})</h2>
                  <button
                    type="button"
                    onClick={adicionarDescontoOp}
                    className="btn"
                    style={{ background: '#eef2ff', color: '#1e3a8a', border: '1px solid #1e3a8a', minHeight: '34px', fontSize: '12px' }}
                  >
                    + Outro desconto
                  </button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '6px' }}>Aplicar</th>
                      <th style={{ padding: '6px' }}>Item</th>
                      <th style={{ padding: '6px' }}>Quantidade</th>
                      <th style={{ padding: '6px' }}>Valor Unitário (R$)</th>
                      <th style={{ padding: '6px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finEdit.descontosOperacionais.map((d, idx) => (
                      <tr key={d.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="checkbox"
                            checked={d.ativo}
                            onChange={e =>
                              setFinEdit(p => {
                                const list = [...p.descontosOperacionais];
                                list[idx] = { ...list[idx], ativo: e.target.checked };
                                return { ...p, descontosOperacionais: list };
                              })
                            }
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            className="in tx"
                            style={{ padding: '4px 8px', minHeight: '32px' }}
                            value={d.nome}
                            onChange={e =>
                              setFinEdit(p => {
                                const list = [...p.descontosOperacionais];
                                list[idx] = { ...list[idx], nome: e.target.value };
                                return { ...p, descontosOperacionais: list };
                              })
                            }
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            className="in"
                            style={{ width: '90px', padding: '4px 8px', minHeight: '32px' }}
                            type="number"
                            value={d.quantidade}
                            onChange={e =>
                              setFinEdit(p => {
                                const list = [...p.descontosOperacionais];
                                list[idx] = { ...list[idx], quantidade: Number(e.target.value || 0) };
                                return { ...p, descontosOperacionais: list };
                              })
                            }
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            className="in"
                            style={{ width: '120px', padding: '4px 8px', minHeight: '32px' }}
                            type="number"
                            value={d.valorUnitario}
                            onChange={e =>
                              setFinEdit(p => {
                                const list = [...p.descontosOperacionais];
                                list[idx] = { ...list[idx], valorUnitario: Number(e.target.value || 0) };
                                return { ...p, descontosOperacionais: list };
                              })
                            }
                          />
                        </td>
                        <td className="num" style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>
                          {formatBRL(d.ativo ? d.quantidade * d.valorUnitario : 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* 6. Créditos Comerciais */}
            {exibirSecao('creditos') && (
              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h2 className="h2" style={{ margin: 0 }}>
                  6. Créditos comerciais (Saem da Taxa Adm do Disk: máx {formatBRL(c.taxaAdm)})
                </h2>
                {c.excedente > 0 && (
                  <div style={{ background: '#fff7ed', border: '1px solid #c2410c', color: '#9a3412', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700 }}>
                    ⚠️ Alerta de Excedente: Rebate + Patrocínio somam {formatBRL(c.rebateBruto + c.patrocinioBruto)}, ultrapassando a Taxa Adm ({formatBRL(c.taxaAdm)}). Excedente de {formatBRL(c.excedente)} NÃO creditado.
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                  <div style={{ border: '1px solid #dde2ee', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={finEdit.rebate.ativo}
                        onChange={e => setFinEdit(p => ({ ...p, rebate: { ...p.rebate, ativo: e.target.checked } }))}
                      />
                      Rebate Comercial (Creditado: {formatBRL(c.rebate)})
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        className="in tx"
                        value={finEdit.rebate.tipo}
                        onChange={e => setFinEdit(p => ({ ...p, rebate: { ...p.rebate, tipo: e.target.value as 'percentual' | 'fixo' } }))}
                      >
                        <option value="percentual">% Bilheteria</option>
                        <option value="fixo">R$ Fixo</option>
                      </select>
                      <input
                        className="in"
                        type="number"
                        step={0.5}
                        value={finEdit.rebate.valor}
                        onChange={e => setFinEdit(p => ({ ...p, rebate: { ...p.rebate, valor: Number(e.target.value || 0) } }))}
                      />
                    </div>
                  </div>

                  <div style={{ border: '1px solid #dde2ee', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '14px' }}>
                      <input
                        type="checkbox"
                        checked={finEdit.patrocinioEvento.ativo}
                        onChange={e =>
                          setFinEdit(p => ({ ...p, patrocinioEvento: { ...p.patrocinioEvento, ativo: e.target.checked } }))
                        }
                      />
                      Patrocínio do Evento (Creditado: {formatBRL(c.patrocinio)})
                    </label>
                    <input
                      className="in tx"
                      placeholder="Descrição do patrocínio"
                      value={finEdit.patrocinioEvento.descricao}
                      onChange={e =>
                        setFinEdit(p => ({ ...p, patrocinioEvento: { ...p.patrocinioEvento, descricao: e.target.value } }))
                      }
                    />
                    <input
                      className="in"
                      type="number"
                      step={100}
                      value={finEdit.patrocinioEvento.valor}
                      onChange={e =>
                        setFinEdit(p => ({ ...p, patrocinioEvento: { ...p.patrocinioEvento, valor: Number(e.target.value || 0) } }))
                      }
                    />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={finEdit.regra.creditosSujeitosTrava}
                    onChange={e =>
                      setFinEdit(p => ({
                        ...p,
                        regra: { ...p.regra, creditosSujeitosTrava: e.target.checked }
                      }))
                    }
                  />
                  Créditos sujeitos às travas de receita e capacidade (se desmarcado, entram livres após a trava)
                </label>
              </section>
            )}

            {/* 7. Regra de Liberação e Faixas */}
            {exibirSecao('regras_faixas') && (
              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className="h2" style={{ margin: 0 }}>7. Regra de travas e faixas de capacidade</h2>
                  <button
                    type="button"
                    onClick={adicionarFaixa}
                    className="btn"
                    style={{ background: '#eef2ff', color: '#1e3a8a', border: '1px solid #1e3a8a', minHeight: '34px', fontSize: '12px' }}
                  >
                    + Adicionar faixa
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <label className="lb">
                    Modo da regra
                    <select
                      className="in tx"
                      value={finEdit.regra.modo}
                      onChange={e =>
                        setFinEdit(p => ({
                          ...p,
                          regra: { ...p.regra, modo: e.target.value as 'MIN' | 'A' | 'B' }
                        }))
                      }
                    >
                      <option value="MIN">MIN(A, B) — Mais restritiva</option>
                      <option value="A">Somente Regra A (Resultado)</option>
                      <option value="B">Somente Regra B (Capacidade)</option>
                    </select>
                  </label>
                  <label className="lb">
                    Regra A · % sobre Resultado
                    <input
                      className="in"
                      type="number"
                      value={finEdit.regra.pctResultado}
                      onChange={e =>
                        setFinEdit(p => ({
                          ...p,
                          regra: { ...p.regra, pctResultado: Number(e.target.value || 0) }
                        }))
                      }
                    />
                  </label>
                  <label className="lb">
                    Reserva reembolso (% bilheteria)
                    <input
                      className="in"
                      type="number"
                      value={finEdit.regra.reservaReembolsoPct}
                      onChange={e =>
                        setFinEdit(p => ({
                          ...p,
                          regra: { ...p.regra, reservaReembolsoPct: Number(e.target.value || 0) }
                        }))
                      }
                    />
                  </label>
                  <label className="lb">
                    Teto máximo R$ (0 = sem teto)
                    <input
                      className="in"
                      type="number"
                      value={finEdit.regra.teto}
                      onChange={e =>
                        setFinEdit(p => ({
                          ...p,
                          regra: { ...p.regra, teto: Number(e.target.value || 0) }
                        }))
                      }
                    />
                  </label>
                  <label className="lb">
                    Libera 100% em D+ (dias úteis bancários)
                    <input
                      className="in"
                      type="number"
                      value={finEdit.regra.liberaTotalDmais}
                      onChange={e =>
                        setFinEdit(p => ({
                          ...p,
                          regra: { ...p.regra, liberaTotalDmais: Number(e.target.value || 0) }
                        }))
                      }
                    />
                    <span className="sub" style={{ fontWeight: 700, color: '#1e3a8a' }}>
                      Liberação 100%: {c.dataLiberacaoTotal || '—'} (s/ sáb, dom e feriados)
                    </span>
                  </label>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '6px' }}>Gatilho (% vendido)</th>
                      <th style={{ padding: '6px' }}>Ingressos equivalentes</th>
                      <th style={{ padding: '6px' }}>% Resultado Liberado (B)</th>
                      <th style={{ padding: '6px' }}>Status</th>
                      <th style={{ padding: '6px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {finEdit.regra.faixas.map((f, idx) => {
                      const isAtual = c.faixaAtual && c.faixaAtual.gatilhoPct === Number(f.gatilhoPct);
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px' }}>
                            <input
                              className="in"
                              style={{ width: '90px', padding: '4px 8px', minHeight: '32px' }}
                              type="number"
                              value={f.gatilhoPct}
                              onChange={e =>
                                setFinEdit(p => {
                                  const list = [...p.regra.faixas];
                                  list[idx] = { ...list[idx], gatilhoPct: Number(e.target.value || 0) };
                                  return { ...p, regra: { ...p.regra, faixas: list } };
                                })
                              }
                            />
                          </td>
                          <td className="num" style={{ padding: '6px', fontWeight: 700 }}>
                            {Math.ceil((Number(f.gatilhoPct) / 100) * c.capacidadeUsada)} ing.
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input
                              className="in"
                              style={{ width: '90px', padding: '4px 8px', minHeight: '32px' }}
                              type="number"
                              value={f.liberaPct}
                              onChange={e =>
                                setFinEdit(p => {
                                  const list = [...p.regra.faixas];
                                  list[idx] = { ...list[idx], liberaPct: Number(e.target.value || 0) };
                                  return { ...p, regra: { ...p.regra, faixas: list } };
                                })
                              }
                            />
                          </td>
                          <td style={{ padding: '6px' }}>
                            {isAtual ? (
                              <span style={{ background: '#dcfce7', color: '#065f46', padding: '3px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 800 }}>
                                Faixa atual ({f.liberaPct}%)
                              </span>
                            ) : c.pctVendido >= f.gatilhoPct ? (
                              <span className="sub">Superada</span>
                            ) : (
                              <span className="sub">Pendente</span>
                            )}
                          </td>
                          <td style={{ padding: '6px' }}>
                            <button
                              type="button"
                              onClick={() => removerFaixa(idx)}
                              style={{ padding: '4px 8px', borderRadius: '6px', border: 0, background: '#fee2e2', color: '#b91c1c', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            )}
          </div>

          {/* COLUNA LATERAL FIXA: PRÉVIA DO CÁLCULO LINHA A LINHA */}
          <aside style={{ flex: '1 1 350px', minWidth: 0, position: 'sticky', top: '20px' }}>
            <section className="card" style={{ border: '2px solid #1e3a8a', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h2 className="h2" style={{ margin: 0 }}>Prévia do cálculo · {evEdit.nome}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Bilheteria</span>
                  <span className="num">{formatBRL(c.bil)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(−) Taxa Adm ({finEdit.taxaAdm.percentual}%)</span>
                  <span className="num">{formatBRL(-c.taxaAdm)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(−) Taxa Operacional</span>
                  <span className="num">{formatBRL(-c.taxaOp)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #dde2ee', paddingTop: '6px', fontWeight: 800, color: '#0f1b3d' }}>
                  <span>(=) Borderô do Produtor</span>
                  <span className="num">{formatBRL(c.bil - c.taxaAdm - c.taxaOp)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(−) Despesas ({c.abaterDespesasAPagar ? 'Pagas + A pagar' : 'Só Pagas'})</span>
                  <span className="num">{formatBRL(-c.despesas)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(−) Retenções provisionadas</span>
                  <span className="num">{formatBRL(-c.totRetencoes)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(−) Descontos operacionais</span>
                  <span className="num">{formatBRL(-c.totOps)}</span>
                </div>
                {c.reserva > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>(−) Reserva reembolso</span>
                    <span className="num">{formatBRL(-c.reserva)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #dde2ee', paddingTop: '6px', fontWeight: 800, color: '#0f1b3d' }}>
                  <span>(=) Resultado do evento</span>
                  <span className="num">{formatBRL(c.resultado)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>• Regra A ({c.pctResultado}%)</span>
                  <span className="num">{formatBRL(c.A)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>• Regra B ({c.liberaPctB}% p/ {formatPct(c.pctVendido)})</span>
                  <span className="num">{formatBRL(c.B)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>(=) Escolhido ({c.modo})</span>
                  <span className="num">{formatBRL(c.escolhido)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(+) Créditos (rebate + patroc.)</span>
                  <span className="num" style={{ color: '#065f46' }}>{formatBRL(c.creditos)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>(−) Já repassado</span>
                  <span className="num">{formatBRL(-c.jaRepassado)}</span>
                </div>
                {c.advEv > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>(−) Advanced evento</span>
                    <span className="num">{formatBRL(-c.advEv)}</span>
                  </div>
                )}
                {c.antEv > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>(−) Antecipação + taxa</span>
                    <span className="num">{formatBRL(-c.antEv)}</span>
                  </div>
                )}
              </div>

              <div style={{ background: '#ecfdf5', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, color: '#065f46' }}>Liberável no evento</span>
                <span className="num" style={{ fontSize: '20px', fontWeight: 800, color: '#065f46' }}>{formatBRL(c.liberavel)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span>Retido pelas travas</span>
                <span className="num" style={{ color: '#9a3412', fontWeight: 700 }}>{formatBRL(c.retido)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span>Saldo devedor</span>
                <span className="num">{formatBRL(c.saldoDevedor)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span>Taxa Adm Líquida Disk</span>
                <span className="num" style={{ color: '#7c3aed', fontWeight: 700 }}>{formatBRL(c.taxaAdmLiquida)}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={handleSalvarAlteracoes}
                  style={{ background: '#1e3a8a', color: '#fff', minHeight: '40px', fontSize: '13px' }}
                >
                  💾 Salvar alterações (com Auditoria)
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setTelaAtiva('pdf')}
                  style={{ background: '#eef2ff', color: '#1e3a8a', border: '1px solid #1e3a8a', minHeight: '38px', fontSize: '13px' }}
                >
                  📄 Emitir Borderô / Fechamento (PDF)
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => nav?.navegarPara('saldos', evEdit.produtoraId)}
                  style={{ background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', minHeight: '36px', fontSize: '12px' }}
                >
                  Ver Posição de Saldo da Produtora →
                </button>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

export const eventosModule: FinancialModulePlugin = {
  id: 'eventos',
  title: 'Eventos e Travas',
  description: 'Apuração de borderô, travas por resultado (Regra A) e capacidade em faixas (Regra B), retenções, descontos, créditos e simulador E se?.',
  rtdbNode: 'eventos_fin',
  render: (dados, sessao, nav) => <EventosTravasWorkspace dados={dados} sessao={sessao} nav={nav} />
};
