import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const contasModule: FinancialModulePlugin = {
  id: 'contas',
  title: 'Contas Bancárias',
  description: 'Homologação e validação de contas bancárias e chaves PIX das produtoras.',
  rtdbNode: 'contas',
  render: () => (
    <section>
      <h2>Contas Bancárias</h2>
      <p>Validação de titularidade e chaves PIX para liberação de repasses.</p>
    </section>
  )
};
