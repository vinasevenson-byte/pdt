import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const negociacoesModule: FinancialModulePlugin = {
  id: 'negociacoes',
  title: 'Negociações',
  description: 'Configuração de Taxa Operacional (fixa, percentual ou por ingresso) e conveniência por evento.',
  rtdbNode: 'negociacoes',
  render: () => (
    <section>
      <h2>Negociações Comerciais</h2>
      <p>Parâmetros exclusivos do perfil Financeiro (nunca expostos ao Produtor).</p>
    </section>
  )
};
