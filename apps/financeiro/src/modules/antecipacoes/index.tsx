import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const antecipacoesModule: FinancialModulePlugin = {
  id: 'antecipacoes',
  title: 'Antecipações',
  description: 'Gestão de solicitações de antecipação sobre saldo retido com taxa configurável.',
  rtdbNode: 'antecipacoes',
  render: () => (
    <section>
      <h2>Antecipações</h2>
      <p>Controle de limite sobre valor retido e abatimento automático no próximo repasse.</p>
    </section>
  )
};
