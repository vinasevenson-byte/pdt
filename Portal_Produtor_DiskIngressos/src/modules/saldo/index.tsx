import { useState } from 'react';
import { formatBRL } from '../../shared/formatters';
import type { EstadoProdutorRTDB } from '../../shared/dadosProdutor';

export interface SaldoProdutorProps {
  dados: EstadoProdutorRTDB;
  onSolicitarRepasse?: () => void;
}

export function SaldoProdutorModule({ dados, onSolicitarRepasse }: SaldoProdutorProps) {
  const [exportMsg, setExportMsg] = useState(false);
  const { consolidado, eventos } = dados;

  const retidoTotal = eventos.reduce((acc, e) => acc + e.retido, 0);
  const jaRepassadoTotal = eventos.reduce((acc, e) => acc + e.jaRepassado, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '14px' }}>
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
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
        <section className="card" style={{ flex: '999 1 640px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <h2 className="h2">Meus eventos</h2>
            <button
              className="btn"
              style={{ background: '#fff', color: '#1e3a8a', border: '1px solid #1e3a8a', minHeight: '44px', fontSize: '14px' }}
              onClick={() => setExportMsg(true)}
            >
              Exportar extrato (CSV)
            </button>
          </div>
          {exportMsg && (
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>
              Extrato gerado com eventos, borderô e repasses.
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '640px' }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: '12px', color: '#5a6584', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 8px' }}>Evento</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>% vendido</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Resultado</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Liberável</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Retido</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map(e => (
                  <tr key={e.id} style={{ borderTop: '1px solid #eef1f7' }}>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontWeight: 800 }}>{e.nome}</div>
                      <div className="sub">{e.data}</div>
                    </td>
                    <td className="num" style={{ padding: '10px 8px', textAlign: 'right' }}>
                      {e.pctVendido.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                    </td>
                    <td className="num" style={{ padding: '10px 8px', textAlign: 'right' }}>{formatBRL(e.resultado)}</td>
                    <td className="num" style={{ padding: '10px 8px', textAlign: 'right', color: '#065f46' }}>{formatBRL(e.liberavel)}</td>
                    <td className="num" style={{ padding: '10px 8px', textAlign: 'right', color: '#9a3412' }}>{formatBRL(e.retido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" style={{ flex: '1 1 380px', minWidth: 0, border: '2px solid #1e3a8a' }}>
          <h2 className="h2">Composição do saldo</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="row">
              <span>Liberável nos eventos</span>
              <span className="num" style={{ color: '#0f1b3d' }}>{formatBRL(consolidado.liberavelEventos)}</span>
            </div>
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
            <div className="row" style={{ borderTop: '1px solid #dde2ee', marginTop: '6px', paddingTop: '10px', fontWeight: 800, color: '#065f46' }}>
              <span>Saldo disponível</span>
              <span className="num" style={{ fontSize: '18px' }}>{formatBRL(consolidado.saldoDisponivel)}</span>
            </div>
          </div>
          {onSolicitarRepasse && (
            <button className="btn" style={{ background: '#047857', color: '#fff' }} onClick={onSolicitarRepasse}>
              Solicitar repasse
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
