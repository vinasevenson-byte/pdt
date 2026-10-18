import { useState, useEffect } from 'react';
import { formatBRL } from '../../shared/formatters';
import type { EstadoProdutorRTDB } from '../../shared/dadosProdutor';

export interface DespesasProdutorProps {
  dados: EstadoProdutorRTDB;
}

export function DespesasProdutorModule({ dados }: DespesasProdutorProps) {
  const { eventos, despesas } = dados;
  const [eventoId, setEventoId] = useState('');

  useEffect(() => {
    if (!eventoId && eventos.length > 0) {
      setEventoId(eventos[0].id);
    }
  }, [eventos, eventoId]);

  const ev = eventos.find(e => e.id === eventoId) || eventos[0];
  const despEvento = ev ? despesas.filter(d => d.eventoId === ev.id) : [];
  const opsTot = ev ? ev.descontosOperacionais.reduce((acc, d) => acc + d.valor, 0) : 0;
  const retTot = ev ? ev.retencoes.reduce((acc, r) => acc + r.valor, 0) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#3d4766', marginRight: '6px' }}>Evento:</span>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '14px' }}>
        <div className="kpi">
          <span>Despesas pagas</span>
          <span className="num" style={{ fontSize: '20px' }}>{formatBRL(ev ? ev.despesasPagas : 0)}</span>
        </div>
        <div className="kpi">
          <span>Despesas a pagar</span>
          <span className="num" style={{ fontSize: '20px', color: '#9a3412' }}>{formatBRL(ev ? ev.despesasAPagar : 0)}</span>
        </div>
        <div className="kpi">
          <span>Descontos operacionais</span>
          <span className="num" style={{ fontSize: '20px' }}>{formatBRL(opsTot)}</span>
        </div>
        <div className="kpi">
          <span>Retenções</span>
          <span className="num" style={{ fontSize: '20px' }}>{formatBRL(retTot)}</span>
        </div>
      </div>

      {ev && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
          <section className="card" style={{ flex: '999 1 560px', minWidth: 0 }}>
            <h2 className="h2">Despesas lançadas · {ev.nome}</h2>
            {despEvento.length === 0 ? (
              <div className="sub">Nenhuma despesa direta lançada neste evento.</div>
            ) : (
              despEvento.map(d => (
                <div key={d.id} className="row" style={{ borderBottom: '1px solid #eef1f7', padding: '10px 0' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f1b3d' }}>{d.categoria} · {d.fornecedor}</div>
                    <div className="sub">{d.data} · {d.nfCodigo}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ color: '#0f1b3d' }}>{formatBRL(d.valor)}</div>
                    <div className="sub" style={{ fontWeight: 700, color: d.status === 'Pago' ? '#065f46' : '#9a3412' }}>{d.status}</div>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="card" style={{ flex: '1 1 380px', minWidth: 0 }}>
            <h2 className="h2">Retenções & Operacionais · {ev.nome}</h2>
            {ev.retencoes.map(r => (
              <div key={r.nome} className="row">
                <span>{r.nome} ({r.status})</span>
                <span className="num">{formatBRL(r.valor)}</span>
              </div>
            ))}
            {ev.descontosOperacionais.map(d => (
              <div key={d.nome} className="row">
                <span>{d.nome} ({d.qtd} × {formatBRL(d.unit)})</span>
                <span className="num">{formatBRL(d.valor)}</span>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
