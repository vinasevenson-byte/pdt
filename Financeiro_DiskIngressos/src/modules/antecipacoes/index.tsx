import { useState } from 'react';
import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import { chamarDecidirAntecipacao } from '../../shared/firebaseFinanceiro';
import { renderizarPainelDecisaoInline, type ConfigModalDecisao } from '../../shared/ModalDecisaoFinanceira';

function AntecipacoesModuleView({ dados }: { dados: Record<string, Record<string, unknown>> }) {
  const [modal, setModal] = useState<ConfigModalDecisao | null>(null);
  const [valoresModal, setValoresModal] = useState({ motivo: '', protocolo: '' });

  const lista = Object.entries((dados?.antecipacoes || {}) as Record<string, Record<string, unknown>>);

  function abrirModal(cfg: ConfigModalDecisao, defaults = { motivo: '', protocolo: '' }) {
    setValoresModal(defaults);
    setModal(cfg);
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h2 style={{ margin: 0 }}>Antecipações (<code>/antecipacoes</code>)</h2>
        <p style={{ color: '#475569', margin: '4px 0 0' }}>
          Controle de limite sobre valor retido, máquina de estados via callable <code>decidirAntecipacao</code> e abatimento automático no próximo repasse.
        </p>
      </div>

      {renderizarPainelDecisaoInline(modal, valoresModal, setValoresModal, () => setModal(null))}

      {lista.length === 0 ? (
        <p style={{ color: '#64748b' }}>Nenhuma antecipação registrada no RTDB.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>ID / Evento</th>
              <th style={{ padding: '8px' }}>Produtora</th>
              <th style={{ padding: '8px', textAlign: 'right' }}>Valor</th>
              <th style={{ padding: '8px' }}>Status</th>
              <th style={{ padding: '8px' }}>Decisão (Callable <code>decidirAntecipacao</code>)</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(([id, a]) => {
              const st = String(a.status || 'Solicitada');
              return (
                <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px' }}><strong>{id}</strong> ({String(a.eventoId || '')})</td>
                  <td style={{ padding: '8px' }}>{String(a.produtoraId || '')}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(Number(a.valor || 0))}</td>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{st}</td>
                  <td style={{ padding: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {st === 'Solicitada' && (
                      <>
                        <button
                          onClick={() => chamarDecidirAntecipacao({ antId: id, acao: 'aprovar' })}
                          style={{ padding: '4px 8px', borderRadius: '4px', border: 0, background: '#047857', color: '#fff', cursor: 'pointer' }}
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => chamarDecidirAntecipacao({ antId: id, acao: 'pagar', protocoloBancario: `PIX-ANT-${id}` })}
                          style={{ padding: '4px 8px', borderRadius: '4px', border: 0, background: '#1d4ed8', color: '#fff', cursor: 'pointer' }}
                        >
                          Aprovar e Pagar
                        </button>
                        <button
                          onClick={() =>
                            abrirModal(
                              {
                                aberto: true,
                                titulo: `Recusar Antecipação ${id}`,
                                subtitulo: 'Cancela a solicitação e o título previsto em Contas a Pagar.',
                                exigeMotivo: true,
                                exigeProtocolo: false,
                                labelConfirmar: 'Confirmar Recusa',
                                corBotao: '#b91c1c',
                                onConfirmar: ({ motivo }) =>
                                  chamarDecidirAntecipacao({ antId: id, acao: 'recusar', motivo: motivo || 'Recusada pelo Financeiro' })
                              },
                              { motivo: 'Recusada pelo Financeiro', protocolo: '' }
                            )
                          }
                          style={{ padding: '4px 8px', borderRadius: '4px', border: 0, background: '#b91c1c', color: '#fff', cursor: 'pointer' }}
                        >
                          Recusar
                        </button>
                      </>
                    )}
                    {st === 'Aprovada' && (
                      <>
                        <button
                          onClick={() => chamarDecidirAntecipacao({ antId: id, acao: 'pagar', protocoloBancario: `PIX-ANT-${id}` })}
                          style={{ padding: '4px 8px', borderRadius: '4px', border: 0, background: '#1d4ed8', color: '#fff', cursor: 'pointer' }}
                        >
                          Liquidar (Paga)
                        </button>
                        <button
                          onClick={() =>
                            abrirModal(
                              {
                                aberto: true,
                                titulo: `Estornar Antecipação Aprovada ${id}`,
                                subtitulo: 'Exige segregação de aprovador e que a antecipação ainda não tenha sido abatida em repasse.',
                                exigeMotivo: true,
                                exigeProtocolo: false,
                                labelConfirmar: 'Confirmar Estorno',
                                corBotao: '#7c2d12',
                                onConfirmar: ({ motivo }) =>
                                  chamarDecidirAntecipacao({ antId: id, acao: 'estornar', motivo: motivo || 'Cancelamento administrativo de antecipação aprovada' })
                              },
                              { motivo: 'Cancelamento administrativo de antecipação aprovada', protocolo: '' }
                            )
                          }
                          style={{ padding: '4px 8px', borderRadius: '4px', border: 0, background: '#7c2d12', color: '#fff', cursor: 'pointer' }}
                        >
                          Estornar
                        </button>
                      </>
                    )}
                    {st === 'Paga' && (
                      <button
                        onClick={() =>
                          abrirModal(
                            {
                              aberto: true,
                              titulo: `Estornar Antecipação Paga ${id}`,
                              subtitulo: 'Exige protocolo de devolução bancária, competência aberta e segregação de funções.',
                              exigeMotivo: true,
                              exigeProtocolo: true,
                              labelProtocolo: 'Protocolo da Devolução Bancária',
                              labelConfirmar: 'Confirmar Devolução e Estorno',
                              corBotao: '#7c2d12',
                              onConfirmar: ({ motivo, protocolo }) =>
                                chamarDecidirAntecipacao({
                                  antId: id,
                                  acao: 'estornar',
                                  motivo: motivo || 'Devolução bancária de antecipação',
                                  protocoloDevolucao: protocolo || `DEV-ANT-${id}`
                                })
                            },
                            { motivo: 'Devolução bancária de antecipação', protocolo: `DEV-ANT-${id}` }
                          )
                        }
                        style={{ padding: '4px 8px', borderRadius: '4px', border: 0, background: '#7c2d12', color: '#fff', cursor: 'pointer' }}
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

export const antecipacoesModule: FinancialModulePlugin = {
  id: 'antecipacoes',
  title: 'Antecipações',
  description: 'Gestão de solicitações de antecipação sobre saldo retido com máquina de estados e estorno.',
  rtdbNode: 'antecipacoes',
  render: (dados) => <AntecipacoesModuleView dados={(dados || {}) as Record<string, Record<string, unknown>>} />
};
