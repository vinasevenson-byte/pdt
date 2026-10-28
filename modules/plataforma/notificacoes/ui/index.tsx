import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: 'notificacoes',
  title: 'Notificações, Alertas e Jobs',
  description: 'Processador do outbox de eventos de domínio (/eventos_dominio), alertas de repasse e monitoramento de vencimentos.',
  rtdbNode: 'notificacoes_central',
  requiresJavaService: false,
  render: () => (
    <section className="card">
      <h2 className="h2">Notificações, Alertas e Jobs</h2>
      <p className="sub">
        Domínio: <strong>plataforma</strong> · Nó RTDB: <code>/notificacoes_central</code> · Callable:{' '}
        <code>processarFilaNotificacoesOutbox</code>.
      </p>
    </section>
  )
};
