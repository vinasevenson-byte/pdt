import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const despesasModule: FinancialModulePlugin = {
  id: 'despesas',
  title: 'Despesas de Eventos',
  description: 'Lançamento de despesas pagas e a pagar vinculadas aos eventos com comprovantes e NF.',
  rtdbNode: 'despesas',
  render: () => (
    <section>
      <h2>Despesas</h2>
      <p>Lançamento de despesas com abatimento configurável por regra do evento.</p>
    </section>
  )
};
