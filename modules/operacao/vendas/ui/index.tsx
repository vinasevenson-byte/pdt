import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: 'vendas',
  title: 'Vendas, Lotes e Cortesias',
  description: 'Ingestão idempotente de lotes de vendas e cortesias com trava de capacidade por setor e geração de Contas a Receber.',
  rtdbNode: 'vendas_lotes',
  requiresJavaService: false,
  render: () => (
    <section className="card">
      <h2 className="h2">Vendas, Lotes e Cortesias</h2>
      <p className="sub">
        Domínio: <strong>operacao</strong> · Nó RTDB: <code>/vendas_lotes</code> · Callable:{' '}
        <code>registrarLoteVendasBordero</code> (idempotente via SHA-256, atualiza vendas e recalcula o borderô em tempo real).
      </p>
    </section>
  )
};
