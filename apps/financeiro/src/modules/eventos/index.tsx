import type { FinancialModulePlugin } from '../../shared/modulePlugin';

export const eventosModule: FinancialModulePlugin = {
  id: 'eventos',
  title: 'Eventos e Travas',
  description: 'Apuração de borderô, travas por resultado (Regra A) e capacidade em faixas (Regra B), retenções e simulador E se?.',
  rtdbNode: 'eventos_fin',
  render: () => (
    <section>
      <h2>Eventos e Travas</h2>
      <p>Gestão de capacidade, travas de liberação (MIN / A / B), retenções, descontos operacionais e créditos limitados à Taxa Adm.</p>
    </section>
  )
};
