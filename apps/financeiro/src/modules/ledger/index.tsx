import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const ledgerModule: FinancialModulePlugin = {
  id: 'ledger',
  title: 'Ledger & Fechamentos',
  description: 'Razão contábil imutável com partida dobrada (/lancamentos) e congelamento mensal (/fechamentos).',
  rtdbNode: 'lancamentos',
  requiresJavaService: true,
  render: () => (
    <section>
      <h2>Ledger de Partida Dobrada (<code>/lancamentos</code>) & Fechamentos (<code>/fechamentos</code>)</h2>
      <p>Lançamentos imutáveis em centavos inteiros: estornos geram novos lançamentos inversos e períodos fechados bloqueiam escrita retroativa.</p>
    </section>
  )
};
