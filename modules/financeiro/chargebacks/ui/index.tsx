import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: 'chargebacks',
  title: 'Chargebacks',
  description: 'Módulo vertical Chargebacks (financeiro/chargebacks) conectado a /chargebacks.',
  rtdbNode: 'chargebacks',
  requiresJavaService: false,
  render: () => (
    <section className="card">
      <h2 className="h2">Chargebacks</h2>
      <p className="sub">Domínio: <strong>financeiro</strong> · Nó RTDB: <code>/chargebacks</code></p>
    </section>
  )
};
