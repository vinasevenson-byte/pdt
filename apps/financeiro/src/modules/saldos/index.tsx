import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const saldosModule: FinancialModulePlugin = {
  id: 'saldos',
  title: 'Saldos por Produtora',
  description: 'Posição consolidada por produtora: retido, liberável, repassado, em antecipação e advanced em aberto.',
  rtdbNode: 'saldos',
  render: () => (
    <section>
      <h2>Posição de Saldos (<code>/saldos/&#123;produtoraId&#125;</code>)</h2>
      <p>Visão consolidada do Financeiro e geração da projeção limpa <code>/extrato_produtor/&#123;produtoraId&#125;</code>.</p>
    </section>
  )
};
