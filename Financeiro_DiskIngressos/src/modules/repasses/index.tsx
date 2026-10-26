import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import { chamarDecidirRepasse } from '../../shared/firebaseFinanceiro';

export const repassesModule: FinancialModulePlugin = {
  id: 'repasses',
  title: 'Saldo Consolidado & Repasses',
  description: 'Aprovação, recusa, registro de protocolo (PIX/TED) e rateio proporcional ou manual com memória de cálculo.',
  rtdbNode: 'repasses',
  render: (dados) => {
    const lista: Array<Record<string, unknown> & { id: string }> = Object.entries(dados?.repasses || {}).map(([id, r]) => ({
      id,
      ...(r as Record<string, unknown>)
    }));
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Saldo Consolidado &amp; Solicitações de Repasse (<code>/repasses</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Validação em tempo real pelo motor de repasse e gravação obrigatória em <code>/auditoria</code>, <code>/contas_pagar</code> e <code>/lancamentos</code> (sem movimentação bancária externa automática).
          </p>
        </div>
        {lista.length === 0 ? (
          <p style={{ color: '#64748b' }}>Nenhuma solicitação de repasse encontrada no RTDB.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>ID / Produtora</th>
                <th style={{ padding: '8px' }}>Eventos</th>
                <th style={{ padding: '8px' }}>Forma</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Valor Solicitado</th>
                <th style={{ padding: '8px' }}>Status</th>
                <th style={{ padding: '8px' }}>Ações (Callable <code>decidirRepasse</code>)</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(r => {
                const evs = Array.isArray(r.eventoIds) ? r.eventoIds.join(', ') : '';
                const status = String(r.status || 'Solicitado');
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px' }}>
                      <strong>{r.id}</strong>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{String(r.produtoraId || '')}</div>
                    </td>
                    <td style={{ padding: '8px' }}>{evs}</td>
                    <td style={{ padding: '8px' }}>{String(r.forma || 'PIX')}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(r.valorSolicitado || 0))}</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{status}</td>
                    <td style={{ padding: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {(status === 'Solicitado' || status === 'AguardandoSegundaAprovacao') && (
                        <>
                          <button
                            onClick={() => chamarDecidirRepasse({ repasseId: r.id, acao: 'aprovar', modoRateio: 'proporcional' })}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: 0, background: '#047857', color: '#fff', cursor: 'pointer' }}
                          >
                            {status === 'AguardandoSegundaAprovacao' ? '2ª Aprovação' : 'Aprovar'}
                          </button>
                          <button
                            onClick={() => chamarDecidirRepasse({ repasseId: r.id, acao: 'recusar', motivo: 'Recusado na conferência financeira' })}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: 0, background: '#b91c1c', color: '#fff', cursor: 'pointer' }}
                          >
                            Recusar
                          </button>
                        </>
                      )}
                      {status === 'Aprovado' && (
                        <>
                          <button
                            onClick={() => chamarDecidirRepasse({ repasseId: r.id, acao: 'pagar', protocoloBancario: `LIQ-${r.id}` })}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: 0, background: '#1d4ed8', color: '#fff', cursor: 'pointer' }}
                          >
                            Liquidar (Pago)
                          </button>
                          <button
                            onClick={() => {
                              const motivo = typeof window !== 'undefined' && typeof window.prompt === 'function'
                                ? window.prompt('Informe o motivo do cancelamento/estorno do repasse aprovado:', 'Cancelamento administrativo antes da liquidação')
                                : 'Cancelamento administrativo antes da liquidação';
                              if (!motivo) return;
                              chamarDecidirRepasse({ repasseId: r.id, acao: 'estornar', motivo });
                            }}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: 0, background: '#7c2d12', color: '#fff', cursor: 'pointer' }}
                          >
                            Estornar
                          </button>
                        </>
                      )}
                      {status === 'Pago' && (
                        <button
                          onClick={() => {
                            const motivo = typeof window !== 'undefined' && typeof window.prompt === 'function'
                              ? window.prompt('Informe o motivo do estorno do repasse pago:', 'Devolução bancária de transferência')
                              : 'Devolução bancária de transferência';
                            if (!motivo) return;
                            const protocoloDevolucao = typeof window !== 'undefined' && typeof window.prompt === 'function'
                              ? window.prompt('Informe o protocolo da devolução bancária:', `DEV-${r.id}`)
                              : `DEV-${r.id}`;
                            if (!protocoloDevolucao) return;
                            chamarDecidirRepasse({ repasseId: r.id, acao: 'estornar', motivo, protocoloDevolucao });
                          }}
                          style={{ padding: '6px 10px', borderRadius: '6px', border: 0, background: '#7c2d12', color: '#fff', cursor: 'pointer' }}
                        >
                          Estornar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    );
  }
};
