import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: 'usuarios',
  title: 'Usuários, Papéis (RBAC) e Alçadas',
  description: 'Gestão auditada de Custom Claims (financeiro, aprovador, operador, fiscal, comercial, auditor, produtor) e alçada de dupla aprovação.',
  rtdbNode: 'usuarios_erp',
  requiresJavaService: false,
  render: () => (
    <section className="card">
      <h2 className="h2">Usuários, Papéis (RBAC) e Alçadas</h2>
      <p className="sub">
        Domínio: <strong>admin</strong> · Nó RTDB: <code>/usuarios_erp</code> e <code>/config/alcada</code> · Callables:{' '}
        <code>atribuirPapelUsuarioERP</code> e <code>configurarAlcadaERP</code>.
      </p>
    </section>
  )
};
