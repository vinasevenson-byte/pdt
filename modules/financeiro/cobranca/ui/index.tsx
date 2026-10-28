import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: 'cobranca',
  title: 'Cobrança, Inadimplência e Devedores',
  description: 'Apuração de eventos devedores, compensação automática entre eventos superavitários e acordos de recomposição de saldo.',
  rtdbNode: 'cobrancas_devedores',
  requiresJavaService: false,
  render: () => (
    <section className="card">
      <h2 className="h2">Cobrança, Inadimplência e Devedores</h2>
      <p className="sub">
        Domínio: <strong>financeiro</strong> · Nó RTDB: <code>/cobrancas_devedores</code> · Callable:{' '}
        <code>apurarCobrancaProdutora</code>.
      </p>
    </section>
  )
};
