import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: 'recebiveis',
  title: 'Recebíveis de Gateway e Adquirente',
  description: 'Agenda de liquidação de adquirentes, cálculo de MDR em centavos, baixa de Contas a Receber e contabilização no Ledger.',
  rtdbNode: 'recebiveis_agenda',
  requiresJavaService: false,
  render: () => (
    <section className="card">
      <h2 className="h2">Recebíveis de Gateway e Adquirente</h2>
      <p className="sub">
        Domínio: <strong>financeiro</strong> · Nó RTDB: <code>/recebiveis_agenda</code> · Callable:{' '}
        <code>liquidarAgendaAdquirente</code>.
      </p>
    </section>
  )
};
