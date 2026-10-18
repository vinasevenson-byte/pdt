import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const advancedModule: FinancialModulePlugin = {
  id: 'advanced',
  title: 'Advanced (Adiantamentos)',
  description: 'Adiantamentos contratuais por evento ou no escopo consolidado da produtora.',
  rtdbNode: 'advanced',
  render: () => (
    <section>
      <h2>Advanced (Adiantamentos)</h2>
      <p>Controle de adiantamentos por evento ou consolidado da produtora.</p>
    </section>
  )
};
