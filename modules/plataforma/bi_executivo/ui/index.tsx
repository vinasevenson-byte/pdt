import type { FinancialModulePlugin } from '../../../../apps/financeiro/src/shared/modulePlugin';

export const modulePlugin: FinancialModulePlugin = {
  id: 'bi_executivo',
  title: 'BI Executivo e DRE Gerencial',
  description: 'GMV consolidado, Take Rate líquido Disk, DRE de taxas e deduções, passivo retido/liberável e posição de tesouraria.',
  rtdbNode: 'bi_executivo',
  requiresJavaService: false,
  render: () => (
    <section className="card">
      <h2 className="h2">BI Executivo e DRE Gerencial</h2>
      <p className="sub">
        Domínio: <strong>plataforma</strong> · Nó RTDB: <code>/bi_executivo</code> · Callable:{' '}
        <code>gerarSnapshotBiExecutivo</code>.
      </p>
    </section>
  )
};
