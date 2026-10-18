import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const contasPagarModule: FinancialModulePlugin = {
  id: 'contas_pagar',
  title: 'Contas a Pagar',
  description: 'Obrigações do Disk: repasses aprovados, despesas "A pagar", retenções a recolher (ISS, ECAD, INPI, Alvará) e devolução de advanced.',
  rtdbNode: 'contas_pagar',
  render: () => (
    <section>
      <h2>Contas a Pagar (<code>/contas_pagar</code>)</h2>
      <p>Gestão de títulos a pagar (Prevista, Aprovada, Paga, Cancelada, Vencida) com baixa integrada ao Ledger de partida dobrada.</p>
    </section>
  )
};
