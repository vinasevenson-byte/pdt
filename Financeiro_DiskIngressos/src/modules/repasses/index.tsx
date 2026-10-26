import { useState } from 'react';
import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import { chamarDecidirRepasse } from '../../shared/firebaseFinanceiro';
import { renderizarPainelDecisaoInline, type ConfigModalDecisao } from '../../shared/ModalDecisaoFinanceira';

function RepassesModuleView({ dados }: { dados: Record<string, Record<string, unknown>> }) {
  const [modal, setModal] = useState<ConfigModalDecisao | null>(null);
  const [valoresModal, setValoresModal] = useState({ motivo: '', protocolo: '' });

  const lista: Array<Record<string, unknown> & { id: string }> = Object.entries(dados?.repasses || {}).map(([id, r]) => ({
    id,
    ...(r as Record<string, unknown>)
  }));

  function abrirModal(cfg: ConfigModalDecisao, defaults = { motivo: '', protocolo: '' }) {
    setValoresModal(defaults);
    setModal(cfg);
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ margin: 0 }}>Saldo Consolidado &amp; Solicitações de Repasse (<code>/repasses</code>)</h2>
        <p style={{ color: '#475569', margin: '4px 0 0' }}>
          Validação em tempo real pelo motor de repasse e gravação obrigatória em <code>/auditoria</code>, <code>/contas_pagar</code>, <code>/estornos</code> e <code>/lancamentos</code> (sem movimentação bancária externa automática).
        </p>
      </div>

      {renderizarPainelDecisaoInline(modal, valoresModal, setValoresModal, () => setModal(null))}

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
                          onClick={() =>
                            abrirModal(
                              {
                                aberto: true,
                                titulo: `Recusar Repasse ${r.id}`,
                                subtitulo: 'Cancela a obrigação prevista em Contas a Pagar e registra o motivo na auditoria.',
                                exigeMotivo: true,
                                exigeProtocolo: false,
                                labelConfirmar: 'Confirmar Recusa',
                                corBotao: '#b91c1c',
                                onConfirmar: ({ motivo }) =>
                                  chamarDecidirRepasse({ repasseId: r.id, acao: 'recusar', motivo: motivo || 'Recusado na conferência financeira' })
                              },
                              { motivo: 'Recusado na conferência financeira', protocolo: '' }
                            )
                          }
                          style={{ padding: '6px 10px', borderRadius: '6px', border: 0, background: '#b91c1c', color: '#fff', cursor: 'pointer' }}
                        >
                          Recusar
                        </button>
                      </>
                    )}
                    {status === 'Aprovado' && (
                      <>
                        <button
                          onClick={() =>
                            abrirModal(
                              {
                                aberto: true,
                                titulo: `Liquidar Repasse ${r.id} (Marcar como Pago)`,
                                subtitulo: 'Gera lançamentos de partida dobrada no Ledger (líquido + tarifa) sem refazer rateio.',
                                exigeMotivo: false,
                                exigeProtocolo: true,
                                labelProtocolo: 'Protocolo Bancário (PIX/TED)',
                                labelConfirmar: 'Confirmar Liquidação',
                                corBotao: '#1d4ed8',
                                onConfirmar: ({ protocolo }) =>
                                  chamarDecidirRepasse({ repasseId: r.id, acao: 'pagar', protocoloBancario: protocolo || `LIQ-${r.id}` })
                              },
                              { motivo: '', protocolo: `LIQ-${r.id}` }
                            )
                          }
                          style={{ padding: '6px 10px', borderRadius: '6px', border: 0, background: '#1d4ed8', color: '#fff', cursor: 'pointer' }}
                        >
                          Liquidar (Pago)
                        </button>
                        <button
                          onClick={() =>
                            abrirModal(
                              {
                                aberto: true,
                                titulo: `Cancelar / Estornar Repasse Aprovado ${r.id}`,
                                subtitulo: 'Reverte jaRepassado nos eventos, restaura abatimentos e cancela a Conta a Pagar.',
                                exigeMotivo: true,
                                exigeProtocolo: false,
                                labelConfirmar: 'Confirmar Estorno',
                                corBotao: '#7c2d12',
                                onConfirmar: ({ motivo }) =>
                                  chamarDecidirRepasse({ repasseId: r.id, acao: 'estornar', motivo: motivo || 'Cancelamento administrativo antes da liquidação' })
                              },
                              { motivo: 'Cancelamento administrativo antes da liquidação', protocolo: '' }
                            )
                          }
                          style={{ padding: '6px 10px', borderRadius: '6px', border: 0, background: '#7c2d12', color: '#fff', cursor: 'pointer' }}
                        >
                          Estornar
                        </button>
                      </>
                    )}
                    {status === 'Pago' && (
                      <button
                        onClick={() =>
                          abrirModal(
                            {
                              aberto: true,
                              titulo: `Estornar Repasse Pago ${r.id} (Devolução Bancária)`,
                              subtitulo: 'Exige segundo aprovador (segregação), protocolo de devolução e competência aberta no Ledger.',
                              exigeMotivo: true,
                              exigeProtocolo: true,
                              labelProtocolo: 'Protocolo da Devolução Bancária',
                              labelConfirmar: 'Confirmar Devolução e Estorno',
                              corBotao: '#7c2d12',
                              onConfirmar: ({ motivo, protocolo }) =>
                                chamarDecidirRepasse({
                                  repasseId: r.id,
                                  acao: 'estornar',
                                  motivo: motivo || 'Devolução bancária de transferência',
                                  protocoloDevolucao: protocolo || `DEV-${r.id}`
                                })
                            },
                            { motivo: 'Devolução bancária de transferência', protocolo: `DEV-${r.id}` }
                          )
                        }
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

export const repassesModule: FinancialModulePlugin = {
  id: 'repasses',
  title: 'Saldo Consolidado & Repasses',
  description: 'Aprovação, recusa, registro de protocolo (PIX/TED), estorno com segregação e rateio proporcional ou manual.',
  rtdbNode: 'repasses',
  render: (dados) => <RepassesModuleView dados={dados} />
};
