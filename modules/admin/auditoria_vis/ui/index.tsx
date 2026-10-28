import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: 'auditoria_vis',
  title: 'Visualizador de Auditoria e Assinaturas',
  description: 'Busca consolidada na trilha de auditoria (/auditoria), verificação de assinaturas eletrônicas de repasses e outbox de eventos de domínio.',
  rtdbNode: 'auditoria_relatorios',
  requiresJavaService: false,
  render: () => (
    <section className="card">
      <h2 className="h2">Visualizador de Auditoria e Assinaturas</h2>
      <p className="sub">
        Domínio: <strong>admin</strong> · Nó RTDB: <code>/auditoria</code> e <code>/auditoria_relatorios</code> · Callable:{' '}
        <code>consultarAuditoriaConsolidada</code>.
      </p>
    </section>
  )
};
