import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const templateModule: FinancialModulePlugin = {
  id: '_template',
  title: 'Módulo Template',
  description: 'Esqueleto padrão para criação de novos módulos financeiros plugáveis.',
  rtdbNode: '_template',
  requiresJavaService: false,
  render: () => (
    <section>
      <h2>Módulo Template</h2>
      <p>Use <code>npm run new:module &lt;nome&gt;</code> para gerar um novo módulo seguindo este molde.</p>
    </section>
  )
};
