import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: 'fornecedores',
  title: 'Fornecedores e Compras Operacionais',
  description: 'Cadastro de fornecedores (CNPJ/PIX), lançamento governado de despesas no borderô (/despesas), provisão em Contas a Pagar e recálculo imediato.',
  rtdbNode: 'fornecedores_op',
  requiresJavaService: false,
  render: () => (
    <section className="card">
      <h2 className="h2">Fornecedores e Compras Operacionais</h2>
      <p className="sub">
        Domínio: <strong>admin</strong> · Nó RTDB: <code>/fornecedores_op</code> e <code>/despesas</code> · Callable:{' '}
        <code>lancarDespesaOperacionalEvento</code>.
      </p>
    </section>
  )
};
