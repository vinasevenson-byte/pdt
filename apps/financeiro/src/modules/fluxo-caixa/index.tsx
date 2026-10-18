import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const fluxoCaixaModule: FinancialModulePlugin = {
  id: 'fluxo_caixa',
  title: 'Fluxo de Caixa',
  description: 'Projetado x Realizado por data útil bancária (D+X) com janelas acumuladas de 30, 60 e 90 dias.',
  rtdbNode: 'fluxo_caixa',
  requiresJavaService: true,
  render: () => (
    <section>
      <h2>Fluxo de Caixa (<code>/fluxo_caixa</code>)</h2>
      <p>Projeção diária e acumulada (30/60/90 dias) integrando Contas a Receber, Contas a Pagar e calendário bancário FEBRABAN.</p>
    </section>
  )
};
