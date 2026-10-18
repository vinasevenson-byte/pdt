import { useState } from 'react';
import { formatBRL } from '../../shared/formatters';
import { PROJECAO_INICIAL_PRODUTOR } from '../../shared/dadosProdutor';

export function AntecipacoesProdutorModule() {
  const { eventos, antecipacoes, antecipacaoConfig } = PROJECAO_INICIAL_PRODUTOR;
  const [eventoId, setEventoId] = useState(eventos[1].id);
  const [valorStr, setValorStr] = useState('1000');
  const [antOk, setAntOk] = useState(false);

  const ev = eventos.find(e => e.id === eventoId) || eventos[0];
  const jaAntecipado = antecipacoes
    .filter(a => a.eventoId === ev.id && a.status !== 'Recusada')
    .reduce((acc, a) => acc + a.valor, 0);
  const limite = Math.max(0, ev.retido * (antecipacaoConfig.pctLimite / 100) - jaAntecipado);
  const valorNum = Number(valorStr.replace(',', '.')) || 0;
  const encargo = (valorNum * antecipacaoConfig.percentualEncargo) / 100;
  const abate = valorNum + encargo;
  const temErro = valorNum > limite + 0.009;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
      <section className="card" style={{ flex: '1 1 420px', minWidth: 0 }}>
        <div>
          <h2 className="h2">Solicitar antecipação</h2>
          <div className="sub" style={{ marginTop: '6px' }}>
            Antecipe até {antecipacaoConfig.pctLimite}% do valor ainda retido pelas travas do evento.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {eventos.map(e => (
            <button
              key={e.id}
              className={e.id === eventoId ? 'pillOn' : 'pill'}
              onClick={() => setEventoId(e.id)}
            >
              {e.nome}
            </button>
          ))}
        </div>

        <div style={{ background: '#f4f6fb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <div className="row"><span>Retido pelas travas</span><span className="num" style={{ color: '#0f1b3d' }}>{formatBRL(ev.retido)}</span></div>
          <div className="row"><span>Já antecipado</span><span className="num">{formatBRL(jaAntecipado)}</span></div>
          <div className="row" style={{ fontWeight: 800, color: '#0f1b3d' }}><span>Limite disponível</span><span className="num">{formatBRL(limite)}</span></div>
        </div>

        <label className="lb">
          Valor a antecipar (R$)
          <input className="in" value={valorStr} onChange={e => setValorStr(e.target.value)} inputMode="decimal" placeholder="0,00" />
        </label>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="row"><span>Encargo de antecipação ({antecipacaoConfig.percentualEncargo}%)</span><span className="num" style={{ color: '#b91c1c' }}>{formatBRL(encargo)}</span></div>
          <div className="row" style={{ fontWeight: 800, color: '#065f46' }}><span>Você recebe agora</span><span className="num">{formatBRL(valorNum)}</span></div>
          <div className="row"><span>Será abatido do evento</span><span className="num">{formatBRL(abate)}</span></div>
        </div>

        {temErro && <div style={{ fontSize: '13px', fontWeight: 700, color: '#b91c1c' }}>O valor ultrapassa o limite disponível.</div>}
        {antOk && (
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#065f46', background: '#ecfdf5', padding: '12px', borderRadius: '10px' }}>
            Antecipação solicitada. O Financeiro vai analisar.
          </div>
        )}

        <button
          className="btn"
          style={{ background: '#047857', color: '#fff' }}
          disabled={valorNum <= 0 || temErro}
          onClick={() => setAntOk(true)}
        >
          Solicitar antecipação
        </button>
      </section>

      <section className="card" style={{ flex: '999 1 560px', minWidth: 0 }}>
        <h2 className="h2">Minhas antecipações</h2>
        {antecipacoes.map(h => {
          const evNome = eventos.find(e => e.id === h.eventoId)?.nome || h.eventoId;
          return (
            <div key={h.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '10px', padding: '12px 0', borderBottom: '1px solid #eef1f7', fontSize: '14px' }}>
              <span style={{ fontWeight: 700, flex: '2 1 200px' }}>{evNome}</span>
              <span style={{ color: '#5a6584', flex: '1 1 100px' }}>{h.data}</span>
              <span className="num" style={{ flex: '1 1 120px', textAlign: 'right' }}>{formatBRL(h.valor)}</span>
              <span style={{ flex: '0 0 100px', textAlign: 'right', fontWeight: 800, color: '#065f46' }}>{h.status}</span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
