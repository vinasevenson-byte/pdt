import { useState, useEffect } from 'react';
import { formatBRL } from '../../shared/formatters';
import type { EstadoProdutorRTDB } from '../../shared/dadosProdutor';
import { chamarSolicitarRepasse } from '../../shared/firebaseProdutor';
import { WaterfallChart } from '../../shared/charts';

export interface RepassesProdutorProps {
  dados: EstadoProdutorRTDB;
  onNavigate?: (tabId: string, eventoId?: string) => void;
}

export function RepassesProdutorModule({ dados, onNavigate }: RepassesProdutorProps) {
  const { eventos, consolidado, contas, repasses } = dados;
  const contasValidadas = contas.filter(c => c.status === 'Validada');

  const [selecionados, setSelecionados] = useState<string[]>(() =>
    eventos.filter(e => e.liberavel > 0).map(e => e.id)
  );
  const [eventoDetalheId, setEventoDetalheId] = useState<string>('');
  const [contaId, setContaId] = useState<string>('');
  const [forma, setForma] = useState<'PIX' | 'TED'>('PIX');
  const [valorStr, setValorStr] = useState<string>('0,00');
  const [ac1, setAc1] = useState(false);
  const [ac2, setAc2] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  useEffect(() => {
    if (!eventoDetalheId && eventos.length > 0) {
      setEventoDetalheId(eventos[0].id);
    }
  }, [eventos, eventoDetalheId]);

  useEffect(() => {
    if (selecionados.length === 0 && eventos.some(e => e.liberavel > 0)) {
      const liberados = eventos.filter(e => e.liberavel > 0).map(e => e.id);
      setSelecionados(liberados);
    }
  }, [eventos]);

  useEffect(() => {
    if (!contaId && contasValidadas.length > 0) {
      const padrao = contasValidadas.find(c => c.padrao) || contasValidadas[0];
      setContaId(padrao.id);
    }
  }, [contasValidadas, contaId]);

  const det = eventos.find(e => e.id === eventoDetalheId) || eventos[0];
  const somaSel = eventos
    .filter(e => selecionados.includes(e.id))
    .reduce((acc, e) => acc + e.liberavel, 0);
  const disponivelSelecao = selecionados.length > 0
    ? Math.max(0, somaSel + consolidado.patrocinioProdutora - consolidado.advConsolidado - consolidado.devedores)
    : 0;

  useEffect(() => {
    if (disponivelSelecao > 0 && (valorStr === '0,00' || valorStr === '0')) {
      setValorStr(disponivelSelecao.toFixed(2).replace('.', ','));
    }
  }, [disponivelSelecao]);

  const retTot = det ? det.retencoes.reduce((acc, r) => acc + r.valor, 0) : 0;
  const opsTot = det ? det.descontosOperacionais.reduce((acc, d) => acc + d.valor, 0) : 0;
  const valorNum = Number(valorStr.replace(/\./g, '').replace(',', '.')) || 0;
  const prazo = forma === 'PIX' ? 'Mesmo dia após aprovação' : 'Até 1 dia útil após aprovação';
  const temErroValor = valorNum > disponivelSelecao + 0.009;

  function toggleEvento(id: string) {
    setSelecionados(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  function limpar() {
    setSelecionados([]);
    setValorStr('0,00');
    setAc1(false);
    setAc2(false);
    setEnviado(false);
    setErroEnvio(null);
  }

  async function submeterSolicitacao() {
    if (!ac1 || !ac2 || selecionados.length === 0 || !contaId || valorNum <= 0 || temErroValor) return;
    setEnviando(true);
    setErroEnvio(null);
    setEnviado(false);
    try {
      await chamarSolicitarRepasse({
        eventoIds: selecionados,
        valor: valorNum,
        forma,
        contaId,
        aceiteBancario: ac1,
        aceiteTermosBordero: ac2
      });
      setEnviado(true);
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : 'Falha ao enviar solicitação de repasse.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
      <div style={{ flex: '999 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <div>
              <h2 className="h2">1. Escolha de quais eventos solicitar</h2>
              <div className="sub" style={{ marginTop: '6px' }}>Combine vários eventos em um único repasse.</div>
            </div>
            <button
              className="btn"
              style={{ background: '#fff', color: '#1e3a8a', border: '1px solid #1e3a8a', minHeight: '44px', fontSize: '14px' }}
              onClick={() => setSelecionados(eventos.filter(e => e.liberavel > 0).map(e => e.id))}
            >
              Selecionar todos liberados
            </button>
          </div>

          {eventos.map(e => {
            const checked = selecionados.includes(e.id);
            const blocked = e.liberavel <= 0;
            const chip = e.faixaAtual
              ? `Liberado parcial · ${e.faixaAtual.liberaPct}% do resultado`
              : 'Bloqueado · abaixo de 30% vendido';
            const chipBg = e.faixaAtual ? '#dcfce7' : '#ffedd5';
            const chipFg = e.faixaAtual ? '#065f46' : '#9a3412';
            const pctTxt = `${e.pctVendido.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

            return (
              <div
                key={e.id}
                style={{
                  border: `1px solid ${checked ? '#1e3a8a' : '#dde2ee'}`,
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '16px'
                }}
              >
                <input
                  type="checkbox"
                  aria-label="Incluir evento no repasse"
                  checked={checked}
                  disabled={blocked}
                  onChange={() => toggleEvento(e.id)}
                  style={{ width: '22px', height: '22px' }}
                />
                <div style={{ flex: '2 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800 }}>{e.nome}</div>
                  <div className="sub">{e.data} · {e.local}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, padding: '5px 10px', borderRadius: '999px', background: chipBg, color: chipFg }}>
                      {chip}
                    </span>
                    <span className="sub">
                      Vendido {pctTxt} de {e.capacidadeUsada} lugares
                    </span>
                  </div>
                  <div style={{ position: 'relative', height: '12px', background: '#e3e7f1', borderRadius: '999px' }} title={`${pctTxt} vendido`}>
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
                    {[30, 50, 80].map(g => (
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
                </div>
                <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#5a6584', fontWeight: 700, textTransform: 'uppercase' }}>Liberável</span>
                  <span className="num" style={{ fontSize: '18px', color: e.liberavel > 0 ? '#065f46' : '#5a6584' }}>{formatBRL(e.liberavel)}</span>
                  <button
                    className="btn"
                    style={{ background: 'transparent', color: '#1e3a8a', padding: '6px 0', minHeight: '36px', fontSize: '13px' }}
                    onClick={() => setEventoDetalheId(e.id)}
                  >
                    Ver demonstrativo
                  </button>
                </div>
              </div>
            );
          })}
        </section>

        {det && (
          <>
            <section className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'baseline' }}>
                <h2 className="h2">Demonstrativo · {det.nome}</h2>
                <span className="sub">Somente leitura</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <div className="row"><span>Borderô do evento</span><span className="num" style={{ color: '#0f1b3d' }}>{formatBRL(det.borderoEvento)}</span></div>
                  <div className="row"><span>(−) Despesas pagas</span><span className="num">{formatBRL(det.despesas)}</span></div>
                  <div className="row"><span>(−) Retenções (ISS, ECAD, Locação…)</span><span className="num" style={{ color: '#b91c1c' }}>{formatBRL(retTot)}</span></div>
                  <div className="row"><span>(−) Descontos operacionais</span><span className="num" style={{ color: '#b91c1c' }}>{formatBRL(opsTot)}</span></div>
                  <div className="row" style={{ borderTop: '1px solid #dde2ee', marginTop: '6px', paddingTop: '10px', fontWeight: 800, color: '#0f1b3d' }}>
                    <span>Resultado do evento</span>
                    <span className="num">{formatBRL(det.resultado)}</span>
                  </div>
                  {onNavigate && (
                    <button
                      className="btn"
                      style={{ alignSelf: 'flex-start', background: 'transparent', color: '#1e3a8a', padding: '6px 0', minHeight: '36px', fontSize: '13px' }}
                      onClick={() => onNavigate('despesas', det.id)}
                    >
                      Ver detalhes em Despesas →
                    </button>
                  )}
                </div>
                <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ background: '#f4f6fb', borderRadius: '12px', padding: '16px', fontSize: '14px', lineHeight: 1.5, color: '#3d4766' }}>
                    {det.regraTexto}
                    <div style={{ marginTop: '8px', fontWeight: 700, color: '#0f1b3d' }}>
                      Liberação de 100% prevista para {det.dataLiberacaoTotal} (48h após o evento).
                    </div>
                  </div>
                  <div className="row"><span>Liberado pela regra</span><span className="num" style={{ color: '#0f1b3d' }}>{formatBRL(det.escolhido)}</span></div>
                  {det.rebate > 0 && <div className="row"><span>(+) Rebate</span><span className="num" style={{ color: '#065f46' }}>{formatBRL(det.rebate)}</span></div>}
                  {det.patrocinio > 0 && <div className="row"><span>(+) Patrocínio do evento</span><span className="num" style={{ color: '#065f46' }}>{formatBRL(det.patrocinio)}</span></div>}
                  <div className="row"><span>(−) Já repassado</span><span className="num">{formatBRL(det.jaRepassado)}</span></div>
                  {det.antEv > 0 && <div className="row"><span>(−) Antecipação recebida</span><span className="num">{formatBRL(det.antEv)}</span></div>}
                  <div style={{ background: '#ecfdf5', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, color: '#065f46' }}>Liberável no evento</span>
                    <span className="num" style={{ fontSize: '20px', color: '#065f46' }}>{formatBRL(det.liberavel)}</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="card">
              <h2 className="h2">Do borderô ao liberável · {det.nome}</h2>
              <WaterfallChart ev={det} />
            </section>
          </>
        )}

        <section className="card">
          <h2 className="h2">Meus repasses</h2>
          {repasses.map(h => (
            <div key={h.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '10px', padding: '12px 0', borderBottom: '1px solid #eef1f7', fontSize: '14px' }}>
              <span style={{ fontWeight: 700, flex: '2 1 220px' }}>{h.eventoIds.join(', ')}</span>
              <span style={{ color: '#5a6584', flex: '1 1 120px' }}>{h.forma} · {h.solicitadoEm}</span>
              <span className="num" style={{ flex: '1 1 120px', textAlign: 'right' }}>{formatBRL(h.valorSolicitado)}</span>
              <span
                style={{
                  flex: '0 0 110px',
                  textAlign: 'right',
                  fontWeight: 800,
                  color: h.status === 'Liquidado' || h.status === 'Pago' ? '#065f46' : h.status === 'Recusado' ? '#b91c1c' : '#9a3412'
                }}
              >
                {h.status}
              </span>
            </div>
          ))}
        </section>
      </div>

      <aside style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <section className="card" style={{ border: '2px solid #1e3a8a' }}>
          <h2 className="h2">Consolidado da seleção</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {eventos.filter(e => selecionados.includes(e.id)).map(x => (
              <div key={x.id} className="row">
                <span>{x.nome}</span>
                <span className="num" style={{ color: '#0f1b3d' }}>{formatBRL(x.liberavel)}</span>
              </div>
            ))}
            {consolidado.patrocinioProdutora > 0 && (
              <div className="row">
                <span>(+) {consolidado.patrocinioDescricao}</span>
                <span className="num" style={{ color: '#065f46' }}>{formatBRL(consolidado.patrocinioProdutora)}</span>
              </div>
            )}
            {consolidado.advConsolidado > 0 && (
              <div className="row">
                <span>(−) Advanced (adiantamentos)</span>
                <span className="num">{formatBRL(consolidado.advConsolidado)}</span>
              </div>
            )}
            {consolidado.devedores > 0 && (
              <div className="row">
                <span>(−) Saldo devedor de eventos</span>
                <span className="num" style={{ color: '#b91c1c' }}>{formatBRL(consolidado.devedores)}</span>
              </div>
            )}
            <div className="row" style={{ borderTop: '1px solid #dde2ee', marginTop: '6px', paddingTop: '10px', fontWeight: 800, color: '#065f46' }}>
              <span>Disponível para repasse</span>
              <span className="num" style={{ fontSize: '18px' }}>{formatBRL(disponivelSelecao)}</span>
            </div>
          </div>
        </section>

        <section className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="h2">2. Conta de destino</h2>
            {onNavigate && (
              <button
                className="btn"
                style={{ background: 'transparent', color: '#1e3a8a', padding: '4px 0', minHeight: '36px', fontSize: '13px' }}
                onClick={() => onNavigate('contas')}
              >
                Gerenciar contas →
              </button>
            )}
          </div>
          {contasValidadas.map(ct => (
            <button
              key={ct.id}
              className="btn"
              onClick={() => setContaId(ct.id)}
              style={{
                textAlign: 'left',
                background: ct.id === contaId ? '#eef2ff' : '#fff',
                border: ct.id === contaId ? '2px solid #1e3a8a' : '1px solid #c9cfdf',
                color: '#0f1b3d',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontWeight: 700
              }}
            >
              <span style={{ fontSize: '16px', fontWeight: 800 }}>{ct.banco}</span>
              <span className="num" style={{ fontSize: '13px', color: '#5a6584' }}>Ag {ct.agencia} · CC {ct.conta}</span>
              <span style={{ fontSize: '13px', color: '#3d4766' }}>PIX: {ct.pix}</span>
            </button>
          ))}

          <h2 className="h2">3. Valor a transferir</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <label className="lb" style={{ flex: 1 }}>
              Valor (R$)
              <input className="in" value={valorStr} onChange={ev => setValorStr(ev.target.value)} inputMode="decimal" placeholder="0,00" />
            </label>
            <button
              className="btn"
              style={{ alignSelf: 'flex-end', background: '#fff', color: '#1e3a8a', border: '1px solid #1e3a8a' }}
              onClick={() => setValorStr(disponivelSelecao.toFixed(2).replace('.', ','))}
            >
              Total
            </button>
          </div>
          {temErroValor && (
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#b91c1c' }}>
              O valor ultrapassa o disponível dos eventos selecionados.
            </div>
          )}

          <h2 className="h2">4. Forma de pagamento</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            {(['PIX', 'TED'] as const).map(f => (
              <button
                key={f}
                className={forma === f ? 'pillOn' : 'pill'}
                style={{ flex: 1 }}
                onClick={() => setForma(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <div style={{ background: '#f4f6fb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
            <div className="row" style={{ fontWeight: 800, color: '#065f46' }}>
              <span>Valor solicitado</span>
              <span className="num" style={{ fontSize: '18px' }}>{formatBRL(valorNum)}</span>
            </div>
            <div className="row">
              <span>Prazo</span>
              <span style={{ fontWeight: 700, color: '#0f1b3d' }}>{prazo}</span>
            </div>
          </div>

          <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14px', cursor: 'pointer', minHeight: '44px' }}>
            <input type="checkbox" checked={ac1} onChange={e => setAc1(e.target.checked)} style={{ width: '20px', height: '20px' }} />
            Declaro que as informações bancárias estão corretas.
          </label>
          <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14px', cursor: 'pointer', minHeight: '44px' }}>
            <input type="checkbox" checked={ac2} onChange={e => setAc2(e.target.checked)} style={{ width: '20px', height: '20px' }} />
            Concordo com os termos de repasse e com os descontos do borderô.
          </label>

          {erroEnvio && (
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#b91c1c', background: '#fef2f2', padding: '12px', borderRadius: '10px' }}>
              {erroEnvio}
            </div>
          )}

          {enviado && (
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#065f46', background: '#ecfdf5', padding: '12px', borderRadius: '10px' }}>
              Solicitação enviada para análise do Financeiro.
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn"
              style={{ flex: 1, background: '#fff', color: '#3d4766', border: '1px solid #c9cfdf' }}
              onClick={limpar}
            >
              Cancelar
            </button>
            <button
              className="btn"
              style={{ flex: 2, background: '#047857', color: '#fff' }}
              disabled={!ac1 || !ac2 || selecionados.length === 0 || !contaId || valorNum <= 0 || temErroValor || enviando}
              onClick={submeterSolicitacao}
            >
              {enviando ? 'Enviando solicitação...' : 'Solicitar repasse'}
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
