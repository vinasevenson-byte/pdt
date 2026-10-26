import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: 'conciliacao',
  title: 'Conciliacao',
  description: 'Módulo vertical Conciliacao (financeiro/conciliacao) conectado a /conciliacoes.',
  rtdbNode: 'conciliacoes',
  requiresJavaService: true,
  render: () => (
    <section className="card">
      <h2 className="h2">Conciliacao</h2>
      <p className="sub">Domínio: <strong>financeiro</strong> · Nó RTDB: <code>/conciliacoes</code></p>
    </section>
  )
};
