import { useState, useEffect } from 'react';
import { formatBRL } from '../../shared/formatters';
import type { EstadoProdutorRTDB } from '../../shared/dadosProdutor';
import { DonutChart } from '../../shared/charts';

export interface DespesasProdutorProps {
  dados: EstadoProdutorRTDB;
  initialEventoId?: string;
}

export function DespesasProdutorModule({ dados, initialEventoId }: DespesasProdutorProps) {
  const { eventos, despesas } = dados;
  const [eventoId, setEventoId] = useState(initialEventoId || '');

  useEffect(() => {
    if (initialEventoId) {
      setEventoId(initialEventoId);
    } else if (!eventoId && eventos.length > 0) {
      setEventoId(eventos[0].id);
    }
  }, [eventos, eventoId, initialEventoId]);

  const ev = eventos.find(e => e.id === eventoId) || eventos[0];
  const despEvento = ev ? despesas.filter(d => d.eventoId === ev.id) : [];
  const pagas = despEvento.filter(d => d.status === 'Pago').reduce((a, d) => a + d.valor, 0) || (ev ? ev.despesasPagas : 0);
  const aPagar = despEvento.filter(d => d.status !== 'Pago').reduce((a, d) => a + d.valor, 0) || (ev ? ev.despesasAPagar : 0);
  const opsTot = ev ? ev.descontosOperacionais.reduce((acc, d) => acc + d.valor, 0) : 0;
  const retTot = ev ? ev.retencoes.reduce((acc, r) => acc + r.valor, 0) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#3d4766', marginRight: '6px' }}>Evento:</span>
        {eventos.map(e => (
          <button
            key={e.id}
            className={e.id === (ev?.id || eventoId) ? 'pillOn' : 'pill'}
            onClick={() => setEventoId(e.id)}
          >
            {e.nome}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '14px' }}>
        <div className="kpi">
          <span>Despesas pagas</span>
          <span className="num" style={{ fontSize: '20px' }}>{formatBRL(pagas)}</span>
          <span className="sub">Abatidas do borderô</span>
        </div>
        <div className="kpi">
          <span>Despesas a pagar</span>
          <span className="num" style={{ fontSize: '20px', color: '#9a3412' }}>{formatBRL(aPagar)}</span>
          <span className="sub">Previstas · ainda não abatem</span>
        </div>
        <div className="kpi">
          <span>Descontos operacionais</span>
          <span className="num" style={{ fontSize: '20px' }}>{formatBRL(opsTot)}</span>
          <span className="sub">Itens por quantidade × unitário</span>
        </div>
        <div className="kpi">
          <span>Retenções</span>
          <span className="num" style={{ fontSize: '20px' }}>{formatBRL(retTot)}</span>
          <span className="sub">ISS, ECAD, locação…</span>
        </div>
      </div>

      {ev && (
        <>
          <section className="card">
            <h2 className="h2">Composição das deduções · {ev.nome}</h2>
            <DonutChart
              slices={[
                { label: 'Despesas pagas', v: pagas, color: '#c2307a' },
                { label: 'Retenções', v: retTot, color: '#0891b2' },
                { label: 'Descontos operacionais', v: opsTot, color: '#2f55c4' }
              ]}
              centerTop="Deduções"
              centerVal={formatBRL(pagas + retTot + opsTot)}
            />
          </section>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
            <section className="card" style={{ flex: '999 1 560px', minWidth: 0 }}>
              <h2 className="h2">Despesas lançadas · {ev.nome}</h2>
              {despEvento.length === 0 ? (
                <div className="sub">Nenhuma despesa direta lançada neste evento.</div>
              ) : (
                despEvento.map(d => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 0',
                      borderBottom: '1px solid #eef1f7',
                      fontSize: '14px'
                    }}
                  >
                    <div style={{ flex: '2 1 220px' }}>
                      <div style={{ fontWeight: 700 }}>{d.categoria} · {d.fornecedor}</div>
                      <div className="sub">{d.data} · {d.nfCodigo}</div>
                    </div>
                    <span className="num" style={{ flex: '1 1 110px', textAlign: 'right' }}>{formatBRL(d.valor)}</span>
                    <span
                      style={{
                        flex: '0 0 90px',
                        textAlign: 'right',
                        fontWeight: 800,
                        color: d.status === 'Pago' ? '#065f46' : '#9a3412'
                      }}
                    >
                      {d.status}
                    </span>
                  </div>
                ))
              )}
            </section>

            <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <section className="card">
                <h2 className="h2">Descontos operacionais</h2>
                {ev.descontosOperacionais.map(d => (
                  <div key={d.nome} className="row">
                    <span>{d.nome} ({d.qtd} × {formatBRL(d.unit)})</span>
                    <span className="num" style={{ color: '#0f1b3d' }}>{formatBRL(d.valor)}</span>
                  </div>
                ))}
                <div className="row" style={{ borderTop: '1px solid #dde2ee', marginTop: '6px', paddingTop: '10px', fontWeight: 800, color: '#0f1b3d' }}>
                  <span>Total operacional</span>
                  <span className="num">{formatBRL(opsTot)}</span>
                </div>
              </section>

              <section className="card">
                <h2 className="h2">Retenções</h2>
                {ev.retencoes.map(r => (
                  <div key={r.nome} className="row">
                    <span>
                      {r.nome}{' '}
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: r.status === 'pago' ? '#dcfce7' : '#ffedd5',
                          color: r.status === 'pago' ? '#065f46' : '#9a3412'
                        }}
                      >
                        {r.status}
                      </span>
                    </span>
                    <span className="num" style={{ color: '#0f1b3d' }}>{formatBRL(r.valor)}</span>
                  </div>
                ))}
                <div className="row" style={{ borderTop: '1px solid #dde2ee', marginTop: '6px', paddingTop: '10px', fontWeight: 800, color: '#0f1b3d' }}>
                  <span>Total retido</span>
                  <span className="num">{formatBRL(retTot)}</span>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
