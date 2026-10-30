import { useState } from 'react';
import type { EstadoProdutorRTDB } from '../../shared/dadosProdutor';
import { formatBRL } from '../../shared/formatters';

export interface ExtratoProdutorProps {
  dados?: EstadoProdutorRTDB;
}

export function ExtratoProdutorModule({ dados }: ExtratoProdutorProps) {
  const eventos = dados?.eventos || [];
  const repasses = dados?.repasses || [];
  const antecipacoes = dados?.antecipacoes || [];
  const consolidado = dados?.consolidado;
  const [filtroStatus, setFiltroStatus] = useState<string>('');
  const [busca, setBusca] = useState<string>('');

  const totalRetido = eventos.reduce((acc, ev) => acc + Number(ev.retido || 0), 0);
  const totalLiberavel = Number(consolidado?.liberavelEventos || 0);
  const totalJaRepassado = eventos.reduce((acc, ev) => acc + Number(ev.jaRepassado || 0), 0);
  const totalAntecipadoAtivo = antecipacoes
    .filter(a => a.status === 'Aprovada' || a.status === 'Paga')
    .reduce((acc, a) => acc + Number(a.valor || 0), 0);
  const totalAdiantamentoConsolidado = Number(consolidado?.advConsolidado || 0);

  const repassesFiltrados = repasses.filter(r => {
    if (filtroStatus && r.status !== filtroStatus) return false;
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      const texto = `${r.id} ${r.eventoIds.join(' ')} ${r.protocoloBancario || ''} ${r.forma}`.toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h2 className="h2">Extrato Consolidado da Produtora</h2>
          <p className="sub">
            Leitura exclusiva da projeção limpa em <code>/extrato_produtor/&#123;produtoraId&#125;</code> e <code>/borderos_produtor/&#123;produtoraId&#125;</code> (retido, liberável, repassado, em antecipação e adiantamentos em aberto).
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar protocolo, evento..."
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          />
          <select
            aria-label="Filtrar status de repasse"
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
          >
            <option value="">Todos os status</option>
            <option value="Solicitado">Solicitado</option>
            <option value="Aprovado">Aprovado</option>
            <option value="Pago">Pago</option>
            <option value="Recusado">Recusado</option>
          </select>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px'
        }}
      >
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Saldo Disponível Hoje</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#047857', marginTop: '6px' }}>
            {formatBRL(Number(consolidado?.saldoDisponivel || 0))}
          </div>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Liberável nos Eventos</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#1e3a8a', marginTop: '6px' }}>
            {formatBRL(totalLiberavel)}
          </div>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Retido pela Regra</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#b45309', marginTop: '6px' }}>
            {formatBRL(totalRetido)}
          </div>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Já Repassado</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>
            {formatBRL(totalJaRepassado)}
          </div>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Antecipações / Adiantamentos</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#7c2d12', marginTop: '6px' }}>
            {formatBRL(totalAntecipadoAtivo + totalAdiantamentoConsolidado)}
          </div>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 10px', fontSize: '16px' }}>Histórico de Movimentações de Repasse ({repassesFiltrados.length})</h3>
        {repassesFiltrados.length === 0 ? (
          <p className="sub">Nenhuma movimentação de repasse encontrada para o filtro selecionado.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Protocolo / ID</th>
                <th style={{ padding: '8px' }}>Eventos</th>
                <th style={{ padding: '8px' }}>Solicitado em</th>
                <th style={{ padding: '8px' }}>Forma</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor Bruto</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor Líquido</th>
                <th style={{ padding: '8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {repassesFiltrados.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px' }}>
                    <strong>{r.id}</strong>
                    {r.protocoloBancario && (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Ref: {r.protocoloBancario}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px' }}>{r.eventoIds.join(', ') || '—'}</td>
                  <td style={{ padding: '8px' }}>{r.solicitadoEm || '—'}</td>
                  <td style={{ padding: '8px' }}>{r.forma}</td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>{formatBRL(Number(r.valorSolicitado || 0))}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(r.valorLiquido || 0))}</td>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
