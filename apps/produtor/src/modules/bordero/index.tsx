import { useState, useEffect } from 'react';
import { formatBRL } from '../../shared/formatters';
import type { EstadoProdutorRTDB } from '../../shared/dadosProdutor';
import { WaterfallChart } from '../../shared/charts';

export interface BorderoProdutorProps {
  dados: EstadoProdutorRTDB;
}

export function BorderoProdutorModule({ dados }: BorderoProdutorProps) {
  const { eventos, produtoraNome, produtoraId } = dados;
  const [eventoId, setEventoId] = useState('');

  useEffect(() => {
    if (!eventoId && eventos.length > 0) {
      setEventoId(eventos[0].id);
    }
  }, [eventos, eventoId]);

  const det = eventos.find(e => e.id === eventoId) || eventos[0];
  const retTot = det ? det.retencoes.reduce((acc, r) => acc + r.valor, 0) : 0;
  const opsTot = det ? det.descontosOperacionais.reduce((acc, d) => acc + d.valor, 0) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#3d4766', marginRight: '6px' }}>Evento:</span>
        {eventos.map(e => (
          <button
            key={e.id}
            className={e.id === (det?.id || eventoId) ? 'pillOn' : 'pill'}
            onClick={() => setEventoId(e.id)}
          >
            {e.nome}
          </button>
        ))}
      </div>

      {det ? (
        <>
          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'baseline' }}>
              <h2 className="h2">Demonstrativo de Borderô · {det.nome}</h2>
              <span className="sub">Projeção limpa (/borderos_produtor/{produtoraId}) · {produtoraNome}</span>
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
      ) : (
        <section className="card">
          <div className="sub">Nenhum borderô disponível para {produtoraNome}.</div>
        </section>
      )}
    </div>
  );
}
