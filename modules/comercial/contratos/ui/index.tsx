import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: 'contratos',
  title: 'Contratos',
  description: 'Módulo vertical Contratos (comercial/contratos) conectado a /contratos.',
  rtdbNode: 'contratos',
  requiresJavaService: false,
  render: () => (
    <section className="card">
      <h2 className="h2">Contratos</h2>
      <p className="sub">Domínio: <strong>comercial</strong> · Nó RTDB: <code>/contratos</code></p>
    </section>
  )
};
