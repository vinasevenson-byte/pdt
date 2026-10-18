import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const contasReceberModule: FinancialModulePlugin = {
  id: 'contas_receber',
  title: 'Contas a Receber',
  description: 'Valores a receber de adquirentes/gateways, taxas do Disk, advanced a compensar e antecipações a receber.',
  rtdbNode: 'contas_receber',
  render: () => (
    <section>
      <h2>Contas a Receber (<code>/contas_receber</code>)</h2>
      <p>Controle de recebíveis de bilheteria, taxas e compensações com liquidação em centavos inteiros.</p>
    </section>
  )
};
