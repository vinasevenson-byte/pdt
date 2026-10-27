import { useState } from 'react';
import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import {
  firebaseFinanceiroConfigurado,
  chamarPreviaFechamento,
  chamarFecharCompetencia,
  chamarReabrirCompetencia
} from '../../shared/firebaseFinanceiro';
import { renderizarPainelDecisaoInline, type ConfigModalDecisao } from '../../shared/ModalDecisaoFinanceira';

interface ContaBalanceteUI {
  conta: string;
  debito: number;
  credito: number;
  saldo: number;
  qtdDebitos: number;
  qtdCreditos: number;
}

interface PreviaFechamentoUI {
  competencia: string;
  statusAtual: string;
  fechado: boolean;
  emFechamento: boolean;
  versao: number;
  seloCalculado: string | null;
  seloGravado: string | null;
  integro: boolean | null;
  aptoParaFechar: boolean;
  bloqueios: Array<{ codigo: string; mensagem: string }>;
  avisos: Array<{ codigo: string; mensagem: string }>;
  balancete: {
    quantidadeLancamentos: number;
    totalDebitos: number;
    totalCreditos: number;
    diferenca: number;
    balanceado: boolean;
    contas: ContaBalanceteUI[];
  };
}

function obterCompetenciaAtualLocal(): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}`;
}

function competenciaAnteriorUI(comp: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(comp);
  if (!m) return comp;
  let ano = Number(m[1]);
  let mes = Number(m[2]) - 1;
  if (mes < 1) {
    mes = 12;
    ano -= 1;
  }
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}`;
}

function FechamentoMensalView({ dados }: { dados: Record<string, Record<string, unknown>> }) {
  const compAtual = obterCompetenciaAtualLocal();
  const compSugerida = competenciaAnteriorUI(compAtual);

  const [competenciaSelecionada, setCompetenciaSelecionada] = useState<string>(compSugerida);
  const [observacoes, setObservacoes] = useState<string>('');
  const [previa, setPrevia] = useState<PreviaFechamentoUI | null>(null);
  const [carregando, setCarregando] = useState<boolean>(false);
  const [mensagemFeedback, setMensagemFeedback] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [modalReabertura, setModalReabertura] = useState<ConfigModalDecisao | null>(null);
  const [valoresModal, setValoresModal] = useState({ motivo: '', protocolo: '' });

  const fechamentosMap = (dados?.fechamentos || {}) as Record<string, Record<string, unknown>>;
  const lancamentosMap = (dados?.lancamentos || {}) as Record<string, Record<string, unknown>>;

  const competenciasSet = new Set<string>([compSugerida, compAtual]);
  for (const k of Object.keys(fechamentosMap)) {
    if (/^\d{4}-\d{2}$/.test(k)) competenciasSet.add(k);
  }
  for (const l of Object.values(lancamentosMap)) {
    const c = String(l?.competencia || '');
    if (/^\d{4}-\d{2}$/.test(c)) competenciasSet.add(c);
  }
  const listaCompetencias = Array.from(competenciasSet).sort().reverse();

  const ultimaFechada =
    Object.entries(fechamentosMap)
      .filter(([, f]) => f && f.fechado === true)
      .map(([k, f]) => String(f.competencia || k))
      .sort()
      .pop() || null;

  async function handleConsultarPrevia(comp: string) {
    setCompetenciaSelecionada(comp);
    setMensagemFeedback(null);
    setCarregando(true);
    try {
      const res = (await chamarPreviaFechamento({ competencia: comp })) as PreviaFechamentoUI;
      setPrevia(res);
    } catch (err) {
      setMensagemFeedback({
        tipo: 'erro',
        texto: err instanceof Error ? err.message : 'Erro ao consultar prévia de fechamento.'
      });
    } finally {
      setCarregando(false);
    }
  }

  async function handleFecharCompetencia(comp: string) {
    setMensagemFeedback(null);
    setCarregando(true);
    try {
      await chamarFecharCompetencia({ competencia: comp, observacoes });
      setObservacoes('');
      setMensagemFeedback({
        tipo: 'ok',
        texto: `Competência ${comp} selada (SHA-256) e encerrada com sucesso.`
      });
      const novaPrevia = (await chamarPreviaFechamento({ competencia: comp })) as PreviaFechamentoUI;
      setPrevia(novaPrevia);
    } catch (err) {
      setMensagemFeedback({
        tipo: 'erro',
        texto: err instanceof Error ? err.message : 'Erro ao fechar competência.'
      });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 style={{ margin: 0 }}>Fechamento Mensal Contábil (<code>/fechamentos</code>)</h2>
        <p style={{ color: '#475569', margin: '4px 0 0' }}>
          Prévia de balancete por conta, bloqueio de inconsistências, fechamento em sequência com selo criptográfico SHA-256 e reabertura auditada com segregação de funções.
        </p>
      </div>

      {!firebaseFinanceiroConfigurado && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: '#fffbeb',
            border: '1px solid #f59e0b',
            color: '#92400e',
            fontSize: '13px',
            fontWeight: 600
          }}
        >
          Aviso: O simulador local não executa as Cloud Functions de Fechamento Mensal (<code>previaFechamento</code>, <code>fecharCompetencia</code>, <code>reabrirCompetencia</code>). Conecte ao Firebase ou Emulator para calcular o selo SHA-256 e gravar em <code>/fechamentos</code>.
        </div>
      )}

      {mensagemFeedback && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: mensagemFeedback.tipo === 'ok' ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${mensagemFeedback.tipo === 'ok' ? '#10b981' : '#ef4444'}`,
            color: mensagemFeedback.tipo === 'ok' ? '#065f46' : '#991b1b',
            fontSize: '13px',
            fontWeight: 700
          }}
        >
          {mensagemFeedback.texto}
        </div>
      )}

      {renderizarPainelDecisaoInline(
        modalReabertura,
        valoresModal,
        setValoresModal,
        () => setModalReabertura(null)
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'flex-end',
          padding: '14px',
          background: '#f8fafc',
          borderRadius: '10px',
          border: '1px solid #e2e8f0'
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 700 }}>
          Competência (YYYY-MM)
          <input
            type="month"
            value={competenciaSelecionada}
            onChange={e => setCompetenciaSelecionada(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 700, flex: '1 1 240px' }}>
          Observações do Fechamento
          <input
            type="text"
            value={observacoes}
            onChange={e => setObservacoes(e.target.value)}
            placeholder="Ex.: Conciliação e retenções conferidas"
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
        </label>
        <button
          disabled={carregando}
          onClick={() => handleConsultarPrevia(competenciaSelecionada)}
          style={{
            padding: '9px 14px',
            borderRadius: '8px',
            border: '1px solid #1e3a8a',
            background: '#eef2ff',
            color: '#1e3a8a',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Consultar Prévia
        </button>
        <button
          disabled={carregando || competenciaSelecionada >= compAtual}
          onClick={() => handleFecharCompetencia(competenciaSelecionada)}
          style={{
            padding: '9px 14px',
            borderRadius: '8px',
            border: 'none',
            background: competenciaSelecionada >= compAtual ? '#94a3b8' : '#047857',
            color: '#fff',
            fontWeight: 700,
            cursor: competenciaSelecionada >= compAtual ? 'not-allowed' : 'pointer'
          }}
        >
          Fechar Competência
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
            <th style={{ padding: '8px' }}>Competência</th>
            <th style={{ padding: '8px' }}>Status</th>
            <th style={{ padding: '8px' }}>Versão</th>
            <th style={{ padding: '8px' }}>Selo SHA-256</th>
            <th style={{ padding: '8px' }}>Fechado Por / Em</th>
            <th style={{ padding: '8px' }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {listaCompetencias.map(comp => {
            const f = fechamentosMap[comp] || {};
            const fechado = f.fechado === true;
            const status = fechado
              ? 'Fechado'
              : f.emFechamento === true
              ? 'Fechando'
              : String(f.status || (comp === compAtual ? 'Em Curso' : 'Aberto'));
            const selo = f.seloSha256 ? `${String(f.seloSha256).slice(0, 16)}…` : '—';
            const podeReabrir = fechado && comp === ultimaFechada;

            return (
              <tr key={comp} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px', fontWeight: 800 }}>{comp}</td>
                <td style={{ padding: '8px', fontWeight: 700 }}>{status}</td>
                <td style={{ padding: '8px' }}>{f.versao ? `v${String(f.versao)}` : '—'}</td>
                <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px' }}>{selo}</td>
                <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>
                  {f.fechadoPor ? `${String(f.fechadoPor)} (${String(f.fechadoEm || '')})` : '—'}
                </td>
                <td style={{ padding: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleConsultarPrevia(comp)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid #1e3a8a',
                      background: '#fff',
                      color: '#1e3a8a',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Prévia
                  </button>
                  {!fechado && comp < compAtual && (
                    <button
                      onClick={() => handleFecharCompetencia(comp)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#047857',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Fechar
                    </button>
                  )}
                  {podeReabrir && (
                    <button
                      onClick={() => {
                        setValoresModal({ motivo: '', protocolo: '' });
                        setModalReabertura({
                          titulo: `Reabrir Competência ${comp}`,
                          subtitulo:
                            'Apenas a última competência fechada pode ser reaberta, e exclusivamente por um operador diferente daquele que a fechou.',
                          labelMotivo: 'Motivo da reabertura contábil (obrigatório)',
                          exigeProtocolo: false,
                          textoConfirmar: 'Confirmar Reabertura',
                          corConfirmar: '#7c2d12',
                          onConfirm: async ({ motivo }) => {
                            await chamarReabrirCompetencia({ competencia: comp, motivo });
                            setMensagemFeedback({
                              tipo: 'ok',
                              texto: `Competência ${comp} reaberta com sucesso.`
                            });
                          }
                        });
                      }}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#7c2d12',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Reabrir
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {previa && (
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #cbd5e1',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0 }}>
              Prévia da Competência <code>{previa.competencia}</code> ({previa.statusAtual})
            </h3>
            {previa.integro === true && (
              <span style={{ padding: '4px 10px', borderRadius: '999px', background: '#dcfce7', color: '#065f46', fontSize: '12px', fontWeight: 800 }}>
                Selo SHA-256 Íntegro
              </span>
            )}
            {previa.integro === false && (
              <span style={{ padding: '4px 10px', borderRadius: '999px', background: '#fef2f2', color: '#991b1b', fontSize: '12px', fontWeight: 800 }}>
                ALERTA: Selo SHA-256 Divergente (Adulteração Detectada)
              </span>
            )}
          </div>

          {previa.bloqueios.length > 0 && (
            <div style={{ padding: '12px', borderRadius: '8px', background: '#fef2f2', color: '#991b1b', fontSize: '13px' }}>
              <strong>Bloqueios ({previa.bloqueios.length}):</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
                {previa.bloqueios.map((b, i) => (
                  <li key={i}>
                    <code>{b.codigo}</code>: {b.mensagem}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {previa.avisos.length > 0 && (
            <div style={{ padding: '12px', borderRadius: '8px', background: '#fffbeb', color: '#92400e', fontSize: '13px' }}>
              <strong>Avisos ({previa.avisos.length}):</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
                {previa.avisos.map((a, i) => (
                  <li key={i}>
                    <code>{a.codigo}</code>: {a.mensagem}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 style={{ margin: '0 0 8px' }}>
              Balancete por Conta ({previa.balancete.quantidadeLancamentos} lançamento(s) — Débitos: {formatBRL(previa.balancete.totalDebitos)} | Créditos: {formatBRL(previa.balancete.totalCreditos)})
            </h4>
            {previa.balancete.contas.length === 0 ? (
              <p style={{ color: '#64748b', margin: 0 }}>Nenhuma conta movimentada nesta competência.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '6px' }}>Conta Contábil</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Débitos</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Créditos</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Saldo (D - C)</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.balancete.contas.map(c => (
                    <tr key={c.conta} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '6px', fontWeight: 700 }}>{c.conta}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{formatBRL(c.debito)}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{formatBRL(c.credito)}</td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>{formatBRL(c.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export const fechamentoModule: FinancialModulePlugin = {
  id: 'fechamento',
  title: 'Fechamento Mensal',
  description: 'Prévia de balancete, fechamento mensal em sequência com selo SHA-256 e reabertura auditada (/fechamentos).',
  rtdbNode: 'fechamentos',
  requiresJavaService: false,
  render: (dados) => <FechamentoMensalView dados={(dados || {}) as Record<string, Record<string, unknown>>} />
};
