import { useState, useEffect } from 'react';
import '../style.css';
import type { FinancialModulePlugin } from '../shared/modulePlugin';
import { formatBRL } from '../shared/formatters';
import {
  firebaseFinanceiroConfigurado,
  observarSessaoFinanceiro,
  assinarDadosFinanceiroRTDB,
  autenticarFinanceiroEmailSenha,
  encerrarSessaoFinanceiro,
  criarEstadoFinanceiroVazio,
  type SessaoFinanceiro,
  type EstadoFinanceiroRTDB
} from '../shared/firebaseFinanceiro';
import { eventosModule } from '../modules/eventos';
import { negociacoesModule } from '../modules/negociacoes';
import { repassesModule } from '../modules/repasses';
import { antecipacoesModule } from '../modules/antecipacoes';
import { advancedModule } from '../modules/advanced';
import { contasModule } from '../modules/contas';
import { despesasModule } from '../modules/despesas';
import { contasPagarModule } from '../modules/contas-pagar';
import { contasReceberModule } from '../modules/contas-receber';
import { saldosModule } from '../modules/saldos';
import { fluxoCaixaModule } from '../modules/fluxo-caixa';
import { ledgerModule } from '../modules/ledger';
import { fechamentoModule } from '../modules/fechamento';
import { cadastroModule } from '../modules/cadastro';
import { VERTICAL_FINANCEIRO_MODULES } from './generatedModules';

/**
 * Todos os 27 módulos registrados e preservados integralmente no Painel Financeiro DiskIngressos.
 */
export const REGISTERED_MODULES: FinancialModulePlugin[] = [
  cadastroModule,
  eventosModule,
  negociacoesModule,
  repassesModule,
  antecipacoesModule,
  advancedModule,
  contasModule,
  despesasModule,
  contasPagarModule,
  contasReceberModule,
  saldosModule,
  fluxoCaixaModule,
  ledgerModule,
  fechamentoModule,
  ...VERTICAL_FINANCEIRO_MODULES
];

export type CompreoGroupId =
  | 'cadastros'
  | 'saldos_repasses'
  | 'contas_tesouraria'
  | 'vendas_recebiveis'
  | 'operacoes_financeiras'
  | 'compras_fornecedores'
  | 'fechamento_fiscal'
  | 'relatorios_inteligencia'
  | 'governanca_auditoria';

interface ModuleCatalogMeta {
  group: CompreoGroupId;
  order: number;
  shortTitle: string;
  desc: string;
  icon: 'saldo' | 'repasses' | 'contas' | 'antecipacoes' | 'despesas';
}

/**
 * Organização dos 27 módulos nos 9 grupos principais do padrão COMPREO — ERP Corporativo.
 * Repasses, Antecipações e Advanced permanecem como operações distintas dentro de Saldos e Repasses.
 */
const MODULE_META: Record<string, ModuleCatalogMeta> = {
  // 1. Cadastros e Estrutura
  cadastro: {
    group: 'cadastros',
    order: 1,
    shortTitle: 'Cadastro Mestre',
    desc: 'Cadastro mestre de produtoras, locais e eventos com CNPJ único e preservação de estado financeiro.',
    icon: 'contas'
  },
  eventos: {
    group: 'cadastros',
    order: 2,
    shortTitle: 'Eventos e Travas',
    desc: 'Borderô de eventos, bilheteria bruta, cortesias, público vendido, simulador What-If e travas de capacidade.',
    icon: 'saldo'
  },
  negociacoes: {
    group: 'cadastros',
    order: 3,
    shortTitle: 'Negociações Comerciais',
    desc: 'Parâmetros comerciais de Taxa Administrativa, Taxa Operacional, Rebate e Patrocínio.',
    icon: 'despesas'
  },

  // 2. Saldos, Repasses e Antecipações (Financial Accounting)
  repasses: {
    group: 'saldos_repasses',
    order: 1,
    shortTitle: 'Saldo Consolidado e Repasses',
    desc: 'Solicitações de repasse, fila de aprovação, recusa, rateio entre eventos e liquidação.',
    icon: 'repasses'
  },
  saldos: {
    group: 'saldos_repasses',
    order: 2,
    shortTitle: 'Saldos por Produtora',
    desc: 'Visão consolidada do saldo disponível, liberável, retido e repassado por produtora.',
    icon: 'saldo'
  },
  antecipacoes: {
    group: 'saldos_repasses',
    order: 3,
    shortTitle: 'Antecipações',
    desc: 'Análise, aprovação e liquidação de antecipações sobre o saldo retido pelas travas.',
    icon: 'antecipacoes'
  },
  advanced: {
    group: 'saldos_repasses',
    order: 4,
    shortTitle: 'Advanced (Adiantamentos)',
    desc: 'Controle de adiantamentos contratuais (Advanced), spread e recomposição de saldo.',
    icon: 'antecipacoes'
  },

  // 3. Contas e Tesouraria
  contas: {
    group: 'contas_tesouraria',
    order: 1,
    shortTitle: 'Contas Bancárias e PIX',
    desc: 'Validação de titularidade CNPJ, contas correntes e chaves PIX das produtoras.',
    icon: 'contas'
  },
  'contas-pagar': {
    group: 'contas_tesouraria',
    order: 2,
    shortTitle: 'Contas a Pagar',
    desc: 'Obrigações financeiras de repasses, fornecedores de eventos e retenções.',
    icon: 'contas'
  },
  'contas-receber': {
    group: 'contas_tesouraria',
    order: 3,
    shortTitle: 'Contas a Receber',
    desc: 'Direitos creditórios sobre adquirentes, PIX e faturamento de taxas.',
    icon: 'contas'
  },
  'fluxo-caixa': {
    group: 'contas_tesouraria',
    order: 4,
    shortTitle: 'Fluxo de Caixa',
    desc: 'Projeção diária e consolidada de entradas e saídas operacionais (30/60/90 dias).',
    icon: 'saldo'
  },
  conciliacao: {
    group: 'contas_tesouraria',
    order: 5,
    shortTitle: 'Conciliação Bancária OFX',
    desc: 'Importação de extratos bancários OFX 1.02/2.x e pareamento automático com títulos.',
    icon: 'saldo'
  },
  remessa: {
    group: 'contas_tesouraria',
    order: 6,
    shortTitle: 'Remessa PIX e CNAB 240',
    desc: 'Geração de lotes de pagamento PIX e arquivos CNAB 240 com processamento de retorno.',
    icon: 'repasses'
  },

  // 4. Vendas e Recebíveis (Sales & Distribution)
  vendas: {
    group: 'vendas_recebiveis',
    order: 1,
    shortTitle: 'Vendas, Lotes e Cortesias',
    desc: 'Operação de vendas por canal, virada de lotes, cortesias e bilheteria auditada.',
    icon: 'saldo'
  },
  recebiveis: {
    group: 'vendas_recebiveis',
    order: 2,
    shortTitle: 'Recebíveis de Adquirentes',
    desc: 'Agenda de liquidação de adquirentes e gateways, MDR e conciliação de cartões/PIX.',
    icon: 'contas'
  },
  contratos: {
    group: 'vendas_recebiveis',
    order: 3,
    shortTitle: 'Contratos e Aditivos',
    desc: 'Contratos comerciais versionados, aditivos de condições, garantias e vigências.',
    icon: 'despesas'
  },

  // 5. Operações Financeiras
  cobranca: {
    group: 'operacoes_financeiras',
    order: 1,
    shortTitle: 'Cobrança e Devedores',
    desc: 'Recuperação de saldos devedores de borderô negativo, acordos e notificações.',
    icon: 'despesas'
  },
  chargebacks: {
    group: 'operacoes_financeiras',
    order: 2,
    shortTitle: 'Chargebacks e Disputas',
    desc: 'Contestação de estornos de cartão, retenção cautelar e abatimento em borderô.',
    icon: 'despesas'
  },

  // 6. Compras e Fornecedores (Material Management)
  despesas: {
    group: 'compras_fornecedores',
    order: 1,
    shortTitle: 'Despesas de Eventos',
    desc: 'Custos diretos, notas fiscais, descontos operacionais e retenções do borderô.',
    icon: 'despesas'
  },
  fornecedores: {
    group: 'compras_fornecedores',
    order: 2,
    shortTitle: 'Fornecedores e Compras',
    desc: 'Homologação de fornecedores, cotações e ordens de compra vinculadas aos eventos.',
    icon: 'contas'
  },

  // 7. Fechamento e Fiscal
  ledger: {
    group: 'fechamento_fiscal',
    order: 1,
    shortTitle: 'Ledger & Razão Contábil',
    desc: 'Livro razão em partidas dobradas imutáveis (/lancamentos) e plano de contas.',
    icon: 'despesas'
  },
  fechamento: {
    group: 'fechamento_fiscal',
    order: 2,
    shortTitle: 'Fechamento Mensal (SHA-256)',
    desc: 'Prévia de balancete por conta, fechamento mensal em sequência com selo SHA-256 e reabertura auditada.',
    icon: 'despesas'
  },
  fiscal: {
    group: 'fechamento_fiscal',
    order: 3,
    shortTitle: 'Apuração Fiscal e Retenções',
    desc: 'Apuração por competência de ISS, ECAD, IRRF e retenções com emissão e baixa de guias.',
    icon: 'despesas'
  },

  // 8. Relatórios e Inteligência (Reports & Analytics)
  bi_executivo: {
    group: 'relatorios_inteligencia',
    order: 1,
    shortTitle: 'BI Executivo e Relatórios (DRE)',
    desc: 'DRE gerencial por evento, margem líquida Disk, take-rate efetivo e snapshots executivos.',
    icon: 'saldo'
  },

  // 9. Governança e Auditoria (Approvals & Administration)
  auditoria_vis: {
    group: 'governanca_auditoria',
    order: 1,
    shortTitle: 'Central de Aprovações e Auditoria',
    desc: 'Trilha imutável de auditoria, assinaturas eletrônicas SHA-256 e relatórios de conformidade.',
    icon: 'despesas'
  },
  usuarios: {
    group: 'governanca_auditoria',
    order: 2,
    shortTitle: 'Usuários, Permissões e Alçadas',
    desc: 'RBAC granular, atribuição de papéis de operadores e matriz de alçada de dupla aprovação.',
    icon: 'contas'
  },
  notificacoes: {
    group: 'governanca_auditoria',
    order: 3,
    shortTitle: 'Notificações, Alertas e Jobs',
    desc: 'Central de alertas operacionais, fila de notificações e execução de jobs agendados.',
    icon: 'antecipacoes'
  }
};

interface CompreoSidebarGroup {
  id: CompreoGroupId;
  label: string;
  compreoRef: string;
  subtitle: string;
  icon: 'cadastros' | 'repasses' | 'tesouraria' | 'vendas' | 'operacoes' | 'compras' | 'fiscal' | 'bi' | 'governanca';
}

const COMPREO_GROUPS: CompreoSidebarGroup[] = [
  {
    id: 'cadastros',
    label: 'Cadastros e Estrutura',
    compreoRef: 'Master Data & Events',
    subtitle: 'Produtoras, locais, eventos, travas de capacidade e negociações comerciais.',
    icon: 'cadastros'
  },
  {
    id: 'saldos_repasses',
    label: 'Saldos e Repasses',
    compreoRef: 'Financial Accounting',
    subtitle: 'Saldos por produtora, solicitações de repasse, antecipações e adiantamentos (Advanced).',
    icon: 'repasses'
  },
  {
    id: 'contas_tesouraria',
    label: 'Contas e Tesouraria',
    compreoRef: 'Treasury & Cash Flow',
    subtitle: 'Contas bancárias, contas a pagar/receber, fluxo de caixa, conciliação OFX e remessa PIX/CNAB.',
    icon: 'tesouraria'
  },
  {
    id: 'vendas_recebiveis',
    label: 'Vendas e Recebíveis',
    compreoRef: 'Sales & Distribution',
    subtitle: 'Operação de vendas, lotes, cortesias, recebíveis de adquirentes e contratos.',
    icon: 'vendas'
  },
  {
    id: 'operacoes_financeiras',
    label: 'Operações Financeiras',
    compreoRef: 'Risk & Collections',
    subtitle: 'Gestão de cobrança de borderô negativo, inadimplência, chargebacks e disputas.',
    icon: 'operacoes'
  },
  {
    id: 'compras_fornecedores',
    label: 'Compras e Fornecedores',
    compreoRef: 'Material Management',
    subtitle: 'Despesas operacionais de eventos, notas fiscais, cotações e fornecedores homologados.',
    icon: 'compras'
  },
  {
    id: 'fechamento_fiscal',
    label: 'Fechamento e Fiscal',
    compreoRef: 'General Ledger & Tax',
    subtitle: 'Livro razão em partidas dobradas, fechamento mensal SHA-256 e apuração de ISS/ECAD/IRRF.',
    icon: 'fiscal'
  },
  {
    id: 'relatorios_inteligencia',
    label: 'Relatórios e Inteligência',
    compreoRef: 'Reports & Analytics',
    subtitle: 'BI executivo, DRE por evento, margem líquida Disk e indicadores estratégicos.',
    icon: 'bi'
  },
  {
    id: 'governanca_auditoria',
    label: 'Governança e Auditoria',
    compreoRef: 'Approvals & Administration',
    subtitle: 'Central de aprovações e assinaturas, trilha de auditoria, usuários/RBAC e jobs.',
    icon: 'governanca'
  }
];

function SidebarGroupIcon({ kind }: { kind: CompreoSidebarGroup['icon'] | 'home' }) {
  if (kind === 'home') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z" />
      </svg>
    );
  }
  if (kind === 'cadastros') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 8h10M7 12h6M7 16h4" />
      </svg>
    );
  }
  if (kind === 'repasses') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    );
  }
  if (kind === 'tesouraria') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18" />
      </svg>
    );
  }
  if (kind === 'vendas') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V7z" />
        <path d="M9 7v12" />
      </svg>
    );
  }
  if (kind === 'operacoes') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4l2.5 2.5" />
      </svg>
    );
  }
  if (kind === 'compras') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
      </svg>
    );
  }
  if (kind === 'fiscal') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 15l2 2 4-4" />
      </svg>
    );
  }
  if (kind === 'bi') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ModuleIcon({ kind }: { kind: 'saldo' | 'repasses' | 'contas' | 'antecipacoes' | 'despesas' }) {
  if (kind === 'saldo') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 15h4" />
      </svg>
    );
  }
  if (kind === 'repasses') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 17L17 7M17 7H8M17 7v9" />
      </svg>
    );
  }
  if (kind === 'contas') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18" />
      </svg>
    );
  }
  if (kind === 'antecipacoes') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  );
}

export function App() {
  // activeId pode ser 'inicio', 'grupo:<CompreoGroupId>' (Dashboard independente de cada grupo) ou '<moduloId>'
  const [activeId, setActiveId] = useState<string>(() => {
    const hash = typeof window === 'undefined' ? '' : decodeURIComponent(window.location.hash.slice(1));
    const id = hash.startsWith('modulo/') ? hash.slice(7) : hash.startsWith('area/') ? `grupo:${hash.slice(5)}` : 'inicio';
    return id === 'inicio' || REGISTERED_MODULES.some(m => m.id === id) ||
      (id.startsWith('grupo:') && COMPREO_GROUPS.some(g => g.id === id.slice(6))) ? id : 'inicio';
  });
  const [abaContabilInicial, setAbaContabilInicial] = useState<'razao' | 'fechamento'>('razao');
  const [filtroProdutoraId, setFiltroProdutoraId] = useState<string>('');
  const [q, setQ] = useState<string>('');
  const [sessao, setSessao] = useState<SessaoFinanceiro | null>(null);
  const [verificandoAuth, setVerificandoAuth] = useState<boolean>(firebaseFinanceiroConfigurado);
  const [dados, setDados] = useState<EstadoFinanceiroRTDB>(() => criarEstadoFinanceiroVazio());
  const [emailLogin, setEmailLogin] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');
  const [erroLogin, setErroLogin] = useState<string | null>(null);

  // Estado da Sidebar COMPREO (recolhível: aberto mostra ícones e nomes; fechado mostra apenas os ícones)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.localStorage.getItem('disk-compreo-sidebar') === 'recolhida'
  );
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({
    cadastros: false,
    saldos_repasses: true,
    contas_tesouraria: false,
    vendas_recebiveis: false,
    operacoes_financeiras: false,
    compras_fornecedores: false,
    fechamento_fiscal: false,
    relatorios_inteligencia: false,
    governanca_auditoria: false
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState<boolean>(false);
  const [cmdQuery, setCmdQuery] = useState<string>('');
  const [notifOpen, setNotifOpen] = useState<boolean>(false);

  function navegarParaModulo(moduloId: string, prodId?: string) {
    if (moduloId !== 'inicio' && !REGISTERED_MODULES.some(m => m.id === moduloId)) return;
    setFiltroProdutoraId(prodId !== undefined ? prodId : '');
    setMobileMenuOpen(false);
    setCmdPaletteOpen(false);
    setNotifOpen(false);

    if (moduloId === 'ledger') {
      setAbaContabilInicial('razao');
    } else if (moduloId === 'fechamento') {
      setAbaContabilInicial('fechamento');
    }

    setActiveId(moduloId);
    const meta = MODULE_META[moduloId];
    if (meta?.group) {
      setGruposAbertos(prev => ({ ...prev, [meta.group]: true }));
    }
  }

  function clicarGrupoSidebar(groupId: CompreoGroupId) {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      setGruposAbertos(prev => ({ ...prev, [groupId]: true }));
    } else {
      setGruposAbertos(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    }
    setActiveId(`grupo:${groupId}`);
    setMobileMenuOpen(false);
  }

  // Rotas compartilháveis: preservam a tela ao atualizar e respeitam Voltar/Avançar.
  useEffect(() => {
    const hash = activeId === 'inicio' ? '#inicio' : activeId.startsWith('grupo:')
      ? `#area/${encodeURIComponent(activeId.slice(6))}` : `#modulo/${encodeURIComponent(activeId)}`;
    if (window.location.hash !== hash) window.history.pushState({ financeiroView: activeId }, '', hash);
  }, [activeId]);

  useEffect(() => {
    const syncRoute = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const target = hash.startsWith('modulo/') ? hash.slice(7) : hash.startsWith('area/')
        ? `grupo:${hash.slice(5)}` : 'inicio';
      if (target === 'inicio' || REGISTERED_MODULES.some(m => m.id === target) ||
        (target.startsWith('grupo:') && COMPREO_GROUPS.some(g => g.id === target.slice(6)))) {
        setActiveId(target);
        const group = MODULE_META[target]?.group || (target.startsWith('grupo:') ? target.slice(6) : '');
        if (group) setGruposAbertos(prev => ({ ...prev, [group]: true }));
      }
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => { window.removeEventListener('popstate', syncRoute); window.removeEventListener('hashchange', syncRoute); };
  }, []);

  useEffect(() => {
    window.localStorage.setItem('disk-compreo-sidebar', sidebarCollapsed ? 'recolhida' : 'expandida');
  }, [sidebarCollapsed]);

  // Atalho global Ctrl+K / Cmd+K para Busca Global
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(v => !v);
        setCmdQuery('');
      } else if (e.key === 'Escape') {
        setCmdPaletteOpen(false);
        setMobileMenuOpen(false);
        setNotifOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const unsubAuth = observarSessaoFinanceiro(s => {
      setSessao(s);
      setVerificandoAuth(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!sessao || !sessao.autorizado) {
      setDados(criarEstadoFinanceiroVazio());
      return;
    }
    const unsubRTDB = assinarDadosFinanceiroRTDB(novoEstado => {
      setDados(novoEstado);
    });
    return () => unsubRTDB();
  }, [sessao]);

  async function handleLogin(ev: React.FormEvent) {
    ev.preventDefault();
    setErroLogin(null);
    try {
      await autenticarFinanceiroEmailSenha(emailLogin, senhaLogin);
    } catch (err) {
      setErroLogin(err instanceof Error ? err.message : 'Credenciais inválidas.');
    }
  }

  const host = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : '127.0.0.1';
  const envUrlProdutor = ((import.meta as unknown as { env?: Record<string, string> }).env || {}).VITE_PRODUTOR_URL;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const urlVisaoProdutor = envUrlProdutor || (isLocalHost ? `http://${host}:5174` : '/produtor.html');

  const dadosRec = dados as unknown as Record<string, unknown>;
  const saldosList = Object.values(dados.saldos || {});
  const temDadosSaldos = saldosList.length > 0;
  const saldoDisponivelTotal = saldosList.reduce((a, s) => a + Number(s.saldoDisponivel || 0), 0);
  const liberavelTotal = saldosList.reduce((a, s) => a + Number(s.saldoLiberavel || 0), 0);
  const retidoTotal = saldosList.reduce((a, s) => a + Number(s.saldoRetido || 0), 0);
  const jaRepassadoTotal = saldosList.reduce((a, s) => a + Number(s.totalRepassadoLiquido || 0), 0);
  const eventosEntries = Object.entries(dados.eventos || {});
  const produtorasEntries = Object.entries(
    ((dadosRec.produtoras || {}) as Record<string, Record<string, unknown>>)
  );
  const repassesEntries = Object.entries(dados.repasses || {});
  const contratosEntries = Object.entries(
    ((dadosRec.contratos || {}) as Record<string, Record<string, unknown>>)
  );

  // Indicadores reais da Central de Pendências e Aprovações
  const repassesPendentes = repassesEntries.filter(([, r]) => r.status === 'Solicitado').length;
  const antecipacoesPendentes = Object.values(dados.antecipacoes || {}).filter(
    a => String((a as Record<string, unknown>).status || '') === 'Solicitada'
  ).length;
  const aprovacoesPendentesTotal = repassesPendentes + antecipacoesPendentes;

  const assinaturasPendentes =
    repassesEntries.filter(
      ([, r]) => r.status === 'Solicitado' && !(r as Record<string, unknown>).assinaturaFinanceiro
    ).length +
    contratosEntries.filter(([, c]) => c.status === 'Pendente Assinatura' || !c.seloSha256).length;

  const conciliacoesDivergentes = Object.values(
    (dadosRec.conciliacoes || {}) as Record<string, Record<string, unknown>>
  ).reduce((acc, c) => acc + Number(c.divergentes || 0), 0);

  const chargebacksAbertos = Object.values(
    (dadosRec.chargebacks || {}) as Record<string, Record<string, unknown>>
  ).filter(c => c.status === 'Aberto' || c.status === 'Em Disputa').length;

  const cpAbertos = Object.values(dados.contasPagar || (dadosRec.contas_pagar as Record<string, unknown>) || {}).filter(
    t => String((t as Record<string, unknown>).status || '') === 'Aberto' || String((t as Record<string, unknown>).status || '') === 'Previsto'
  ).length;

  const despesasEntries = Object.entries(dados.despesas || {});
  const totalDespesasValor = despesasEntries.reduce(
    (acc, [, d]) => acc + Number((d as Record<string, unknown>).valor || 0),
    0
  );

  const guiasFiscaisPendentes = Object.values(
    (dadosRec.apuracoes_fiscais || {}) as Record<string, Record<string, unknown>>
  ).filter(g => g.status === 'Emitida' || g.status === 'Aberta').length;

  const totalNotificacoesAlerta =
    aprovacoesPendentesTotal + assinaturasPendentes + conciliacoesDivergentes + guiasFiscaisPendentes;

  const contadoresPorGrupo: Record<CompreoGroupId, number> = {
    cadastros: eventosEntries.length,
    saldos_repasses: aprovacoesPendentesTotal,
    contas_tesouraria: cpAbertos + conciliacoesDivergentes,
    vendas_recebiveis: contratosEntries.length || eventosEntries.length,
    operacoes_financeiras: chargebacksAbertos,
    compras_fornecedores: despesasEntries.length,
    fechamento_fiscal: guiasFiscaisPendentes,
    relatorios_inteligencia: eventosEntries.length,
    governanca_auditoria: assinaturasPendentes
  };

  const totDonut = Math.max(1, jaRepassadoTotal + liberavelTotal + retidoTotal);
  const a1 = (jaRepassadoTotal / totDonut) * 360;
  const a2 = ((jaRepassadoTotal + liberavelTotal) / totDonut) * 360;
  const donutGradient = `#0d9488 0deg ${a1.toFixed(1)}deg, #0284c7 ${a1.toFixed(1)}deg ${a2.toFixed(1)}deg, #f59e0b ${a2.toFixed(1)}deg 360deg`;

  const qNorm = q.trim().toLowerCase();
  const modulosFiltrados = qNorm
    ? REGISTERED_MODULES.filter(m => {
        const meta = MODULE_META[m.id];
        return (
          m.title.toLowerCase().includes(qNorm) ||
          (meta && meta.shortTitle.toLowerCase().includes(qNorm)) ||
          (meta && meta.desc.toLowerCase().includes(qNorm))
        );
      })
    : REGISTERED_MODULES;

  // Busca Global (Módulos + Produtoras + Eventos + Repasses + Contratos)
  const cmdNorm = cmdQuery.trim().toLowerCase();
  const modulosBuscaGlobal = REGISTERED_MODULES.filter(m => {
    if (!cmdNorm) return true;
    const meta = MODULE_META[m.id];
    const grp = COMPREO_GROUPS.find(g => g.id === meta?.group);
    return (
      m.title.toLowerCase().includes(cmdNorm) ||
      (meta && meta.shortTitle.toLowerCase().includes(cmdNorm)) ||
      (meta && meta.desc.toLowerCase().includes(cmdNorm)) ||
      (grp && grp.label.toLowerCase().includes(cmdNorm))
    );
  });

  const entidadesBuscaGlobal: Array<{ tipo: string; id: string; titulo: string; detalhe: string; moduloAlvo: string; prodId?: string }> = [];
  if (cmdNorm) {
    for (const [id, p] of produtorasEntries) {
      const nome = String(p.nomeFantasia || p.razaoSocial || id);
      const cnpj = String(p.cnpj || '');
      if (nome.toLowerCase().includes(cmdNorm) || cnpj.toLowerCase().includes(cmdNorm) || id.toLowerCase().includes(cmdNorm)) {
        entidadesBuscaGlobal.push({
          tipo: 'Produtor',
          id,
          titulo: nome,
          detalhe: `CNPJ ${cnpj || '—'} · ID ${id}`,
          moduloAlvo: 'saldos',
          prodId: id
        });
      }
    }
    for (const [id, ev] of eventosEntries) {
      const nome = String(ev.nome || id);
      if (nome.toLowerCase().includes(cmdNorm) || id.toLowerCase().includes(cmdNorm)) {
        entidadesBuscaGlobal.push({
          tipo: 'Evento',
          id,
          titulo: nome,
          detalhe: `Data ${String(ev.data || '—')} · Bilheteria ${formatBRL(Number(ev.bilheteria || 0))}`,
          moduloAlvo: 'eventos'
        });
      }
    }
    for (const [id, rep] of repassesEntries) {
      const status = String(rep.status || '');
      const prod = String(rep.produtoraId || '');
      if (id.toLowerCase().includes(cmdNorm) || prod.toLowerCase().includes(cmdNorm) || status.toLowerCase().includes(cmdNorm)) {
        entidadesBuscaGlobal.push({
          tipo: 'Repasse',
          id,
          titulo: `Repasse ${id}`,
          detalhe: `${status} · ${formatBRL(Number(rep.valorSolicitado || rep.valorBruto || 0))}`,
          moduloAlvo: 'repasses'
        });
      }
    }
    for (const [id, ct] of contratosEntries) {
      const prod = String(ct.produtoraId || '');
      if (id.toLowerCase().includes(cmdNorm) || prod.toLowerCase().includes(cmdNorm)) {
        entidadesBuscaGlobal.push({
          tipo: 'Contrato',
          id,
          titulo: `Contrato ${id}`,
          detalhe: `Produtora ${prod} · Status ${String(ct.status || 'Ativo')}`,
          moduloAlvo: 'contratos'
        });
      }
    }
  }

  const isGroupDashboard = activeId.startsWith('grupo:');
  const activeGroupId: CompreoGroupId | null = isGroupDashboard
    ? (activeId.slice('grupo:'.length) as CompreoGroupId)
    : MODULE_META[activeId]?.group || null;
  const activeGroupDef = COMPREO_GROUPS.find(g => g.id === activeGroupId) || null;
  const activeModule = REGISTERED_MODULES.find(m => m.id === activeId) || REGISTERED_MODULES[0];
  const activeMeta = MODULE_META[activeId];

  function renderizarDashboardDeGrupo(group: CompreoSidebarGroup) {
    const modsGrupo = REGISTERED_MODULES.filter(m => MODULE_META[m.id]?.group === group.id).sort(
      (a, b) => (MODULE_META[a.id]?.order || 99) - (MODULE_META[b.id]?.order || 99)
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <section
          className="card"
          style={{
            borderLeft: '4px solid #0d9488',
            display: 'flex',
            flexWrap: 'wrap',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px'
          }}
        >
          <div>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Área Operacional · {group.compreoRef}
            </div>
            <h2 className="h2" style={{ fontSize: '22px', marginTop: '4px' }}>
              Dashboard · {group.label}
            </h2>
            <p className="sub" style={{ margin: '4px 0 0' }}>
              {group.subtitle}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {modsGrupo.map(m => (
              <button
                key={`quick-${m.id}`}
                type="button"
                className="btn"
                style={{ background: '#0d9488', color: '#fff', fontSize: '13px', minHeight: '38px', padding: '8px 14px' }}
                onClick={() => navegarParaModulo(m.id)}
              >
                Abrir {MODULE_META[m.id]?.shortTitle || m.title} →
              </button>
            ))}
          </div>
        </section>

        {/* Indicadores específicos da área */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
          <div className="kpi" style={{ borderTop: '3px solid #0d9488' }}>
            <span>Módulos Integrados na Área</span>
            <span className="num" style={{ fontSize: '22px', color: '#0f766e' }}>{modsGrupo.length}</span>
            <span className="sub">Rotas e permissões preservadas</span>
          </div>
          <div className="kpi">
            <span>Saldo Disponível Carteira</span>
            <span className="num" style={{ fontSize: '20px', color: '#0f172a' }}>{formatBRL(saldoDisponivelTotal)}</span>
            <span className="sub">{temDadosSaldos ? `${saldosList.length} produtora(s)` : 'Sem dados disponíveis'}</span>
          </div>
          <div className="kpi">
            <span>Eventos Monitorados</span>
            <span className="num" style={{ fontSize: '20px', color: '#0f172a' }}>{eventosEntries.length}</span>
            <span className="sub">Liberável: {formatBRL(liberavelTotal)}</span>
          </div>
          <div className="kpi">
            <span>Registros / alertas da área</span>
            <span className="num" style={{ fontSize: '20px', color: contadoresPorGrupo[group.id] > 0 ? '#d97706' : '#0f766e' }}>
              {contadoresPorGrupo[group.id] || 0}
            </span>
            <span className="sub">Indicador vinculado aos dados do RTDB</span>
          </div>
        </div>

        <div className="grp">Submenus e Operações de {group.label}</div>
        <div className="mods">
          {modsGrupo.map(mod => {
            const meta = MODULE_META[mod.id];
            return (
              <button key={mod.id} className="mod" onClick={() => navegarParaModulo(mod.id)}>
                <span className="ic">
                  <ModuleIcon kind={meta?.icon || 'saldo'} />
                </span>
                <span style={{ flex: 1 }}>
                  <span className="mtt">{meta?.shortTitle || mod.title}</span>
                  <span className="mtd">{meta?.desc || mod.description}</span>
                  <span className="bdg">Nó RTDB: /{mod.rtdbNode}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif", color: '#0f172a', minHeight: '100vh', boxSizing: 'border-box' }}>
      {(!sessao || !sessao.autorizado) ? (
        <>
          <header className="erp-topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#0d9488',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: '15px'
                }}
              >
                DI
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#0d9488' }}>
                  DiskIngressos · Financeiro Interno
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
                  Hub de Repasses · ERP Financeiro
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
              <a
                href={urlVisaoProdutor}
                style={{
                  background: '#f0fdfa',
                  color: '#0f766e',
                  border: '1px solid #99f6e4',
                  fontSize: '13px',
                  fontWeight: 800,
                  padding: '10px 16px',
                  borderRadius: '10px',
                  textDecoration: 'none'
                }}
              >
                Visão Produtor →
              </a>
            </div>
          </header>
          <div style={{ maxWidth: '480px', margin: '48px auto', padding: '0 24px' }}>
            <section className="card">
              <h2 className="h2">Autenticação Obrigatória · Financeiro Disk</h2>
              <p className="sub">
                Acesso restrito a operadores autenticados no Firebase Auth com Custom Claim <code>role === &apos;financeiro&apos;</code>.
              </p>
              {verificandoAuth ? (
                <p className="sub">Verificando sessão e permissões no Firebase...</p>
              ) : sessao && !sessao.autorizado ? (
                <div style={{ padding: '12px', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>
                  Acesso bloqueado: o usuário {sessao.email} possui role &quot;{sessao.role || 'nenhuma'}&quot;, mas este portal exige <code>role === &apos;financeiro&apos;</code>.
                </div>
              ) : (
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label className="lb">
                    E-mail corporativo (Financeiro)
                    <input
                      className="in tx"
                      type="email"
                      value={emailLogin}
                      onChange={e => setEmailLogin(e.target.value)}
                      required
                    />
                  </label>
                  <label className="lb">
                    Senha
                    <input
                      className="in tx"
                      type="password"
                      value={senhaLogin}
                      onChange={e => setSenhaLogin(e.target.value)}
                      required
                    />
                  </label>
                  {erroLogin && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 600 }}>{erroLogin}</div>}
                  <button
                    type="submit"
                    className="btn"
                    style={{ background: '#0d9488', color: '#fff' }}
                  >
                    Autenticar no Painel Financeiro
                  </button>
                </form>
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="erp-shell">
          {/* Backdrop Mobile */}
          <div
            className={`erp-backdrop ${mobileMenuOpen ? 'open' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* SIDEBAR COMPREO — MENU LATERAL RECOLHÍVEL COM 9 GRUPOS EXPANSÍVEIS */}
          <aside
            className={`erp-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'open' : ''}`}
            aria-label="Menu lateral financeiro DiskIngressos"
          >
            {/* Topo da Sidebar: Marca + Botão Recolher */}
            <div
              style={{
                padding: sidebarCollapsed ? '16px 12px' : '16px 18px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed ? 'center' : 'space-between',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                    color: '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontSize: '14px',
                    flex: 'none',
                    boxShadow: '0 4px 10px rgba(13, 148, 136, 0.25)'
                  }}
                >
                  DI
                </div>
                {!sidebarCollapsed && (
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                      DiskIngressos
                    </div>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#0d9488' }}>
                      Financeiro Interno
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="erp-desktop-collapse"
                title={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral (apenas ícones)'}
                onClick={() => setSidebarCollapsed(v => !v)}
                style={{
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#475569',
                  borderRadius: '8px',
                  width: '28px',
                  height: '28px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 800
                }}
              >
                {sidebarCollapsed ? '»' : '«'}
              </button>
              <button
                type="button"
                className="erp-mobile-toggle"
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#0f172a',
                  borderRadius: '8px',
                  padding: '4px 8px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {/* Item Home: Visão Geral Financeira */}
            <div style={{ padding: '10px 10px 4px' }}>
              <button
                type="button"
                title="Visão Geral Financeira (Home)"
                onClick={() => navegarParaModulo('inicio')}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: sidebarCollapsed ? 'center' : 'space-between',
                  gap: '10px',
                  padding: sidebarCollapsed ? '10px' : '10px 12px',
                  borderRadius: '10px',
                  border: activeId === 'inicio' ? '1px solid #99f6e4' : '1px solid transparent',
                  background: activeId === 'inicio' ? '#f0fdfa' : 'transparent',
                  color: activeId === 'inicio' ? '#0f766e' : '#334155',
                  fontWeight: activeId === 'inicio' ? 800 : 700,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: activeId === 'inicio' ? '#0d9488' : '#64748b', display: 'inline-flex' }}>
                    <SidebarGroupIcon kind="home" />
                  </span>
                  {!sidebarCollapsed && <span>Visão Geral</span>}
                </span>
                {!sidebarCollapsed && aprovacoesPendentesTotal > 0 && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: '#0d9488',
                      color: '#fff'
                    }}
                  >
                    {aprovacoesPendentesTotal}
                  </span>
                )}
              </button>
            </div>

            {/* 9 GRUPOS PRINCIPAIS EXPANSÍVEIS */}
            <nav style={{ flex: 1, padding: '6px 10px 24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {COMPREO_GROUPS.map(grp => {
                const aberto = Boolean(gruposAbertos[grp.id]);
                const modsGrupo = REGISTERED_MODULES.filter(m => MODULE_META[m.id]?.group === grp.id).sort(
                  (a, b) => (MODULE_META[a.id]?.order || 99) - (MODULE_META[b.id]?.order || 99)
                );
                const isGrupoAtivo = activeGroupId === grp.id;
                const badgeCount = contadoresPorGrupo[grp.id] || 0;

                return (
                  <div
                    key={grp.id}
                    style={{
                      borderRadius: '10px',
                      background: isGrupoAtivo && !sidebarCollapsed ? '#f8fafc' : 'transparent'
                    }}
                  >
                    <button
                      type="button"
                      title={`${grp.label} (${grp.compreoRef})`}
                      onClick={() => clicarGrupoSidebar(grp.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: sidebarCollapsed ? 'center' : 'space-between',
                        gap: '10px',
                        padding: sidebarCollapsed ? '10px' : '9px 12px',
                        borderRadius: '10px',
                        border: isGrupoAtivo ? '1px solid #99f6e4' : '1px solid transparent',
                        background: isGrupoAtivo ? '#f0fdfa' : 'transparent',
                        color: isGrupoAtivo ? '#0f766e' : '#334155',
                        fontSize: '13px',
                        fontWeight: isGrupoAtivo ? 800 : 700,
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span style={{ color: isGrupoAtivo ? '#0d9488' : '#64748b', display: 'inline-flex', flex: 'none' }}>
                          <SidebarGroupIcon kind={grp.icon} />
                        </span>
                        {!sidebarCollapsed && (
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {grp.label}
                          </span>
                        )}
                      </span>
                      {!sidebarCollapsed && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 'none' }}>
                          {badgeCount > 0 && (
                            <span
                              style={{
                                fontSize: '10.5px',
                                fontWeight: 800,
                                padding: '1px 7px',
                                borderRadius: '999px',
                                background: isGrupoAtivo ? '#0d9488' : '#e2e8f0',
                                color: isGrupoAtivo ? '#fff' : '#475569'
                              }}
                            >
                              {badgeCount}
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: '#64748b' }}>{aberto ? '▾' : '▸'}</span>
                        </span>
                      )}
                    </button>

                    {/* Submenus expansíveis do grupo */}
                    {aberto && !sidebarCollapsed && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          padding: '4px 6px 8px 22px',
                          borderLeft: '2px solid #ccfbf1',
                          marginLeft: '20px',
                          marginTop: '2px'
                        }}
                      >
                        {modsGrupo.map(mod => {
                          const meta = MODULE_META[mod.id];
                          const isModAtivo = activeId === mod.id;
                          return (
                            <button
                              key={mod.id}
                              type="button"
                              onClick={() => navegarParaModulo(mod.id)}
                              style={{
                                width: '100%',
                                border: 0,
                                borderRadius: '8px',
                                background: isModAtivo ? '#0d9488' : 'transparent',
                                color: isModAtivo ? '#ffffff' : '#475569',
                                fontWeight: isModAtivo ? 800 : 600,
                                fontSize: '12.5px',
                                padding: '7px 10px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '6px'
                              }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {meta?.shortTitle || mod.title}
                              </span>
                              {mod.id === 'repasses' && repassesPendentes > 0 && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    padding: '1px 6px',
                                    borderRadius: '999px',
                                    background: isModAtivo ? '#fff' : '#fef3c7',
                                    color: isModAtivo ? '#0f766e' : '#92400e'
                                  }}
                                >
                                  {repassesPendentes}
                                </span>
                              )}
                              {mod.id === 'antecipacoes' && antecipacoesPendentes > 0 && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 800,
                                    padding: '1px 6px',
                                    borderRadius: '999px',
                                    background: isModAtivo ? '#fff' : '#fef3c7',
                                    color: isModAtivo ? '#0f766e' : '#92400e'
                                  }}
                                >
                                  {antecipacoesPendentes}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* COLUNA PRINCIPAL (TOPBAR COMPREO + BREADCRUMBS + CONTEÚDO) */}
          <div className="erp-main-col">
            <header className="erp-topbar">
              {/* Esquerda: Hambúrguer Mobile + Breadcrumbs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  className="erp-mobile-toggle"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Abrir menu lateral"
                  style={{
                    background: '#f0fdfa',
                    border: '1px solid #99f6e4',
                    color: '#0f766e',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  ☰ Menu
                </button>
                <div>
                  {/* Breadcrumb: Financeiro / Grupo / Módulo */}
                  <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                    <button
                      type="button"
                      onClick={() => navegarParaModulo('inicio')}
                      style={{ border: 0, background: 'transparent', color: '#0d9488', fontWeight: 800, cursor: 'pointer', padding: 0 }}
                    >
                      Financeiro
                    </button>
                    <span>/</span>
                    {activeId === 'inicio' ? (
                      <span style={{ color: '#0f172a' }}>Visão Geral Financeira</span>
                    ) : isGroupDashboard && activeGroupDef ? (
                      <span style={{ color: '#0f172a' }}>{activeGroupDef.label}</span>
                    ) : (
                      <>
                        {activeGroupDef && (
                          <>
                            <button
                              type="button"
                              onClick={() => setActiveId(`grupo:${activeGroupDef.id}`)}
                              style={{ border: 0, background: 'transparent', color: '#475569', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                            >
                              {activeGroupDef.label}
                            </button>
                            <span>/</span>
                          </>
                        )}
                        <span style={{ color: '#0f172a', fontWeight: 800 }}>
                          {activeMeta?.shortTitle || activeModule.title}
                        </span>
                      </>
                    )}
                  </nav>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    {activeId === 'inicio'
                      ? 'Visão Geral Financeira · Carteira DiskIngressos'
                      : isGroupDashboard && activeGroupDef
                      ? `${activeGroupDef.label} · ${activeGroupDef.compreoRef}`
                      : activeMeta?.shortTitle || activeModule.title}
                  </div>
                </div>
              </div>

              {/* Direita: Busca Global + Notificações + Perfil + Visão Produtor */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => {
                    setCmdPaletteOpen(true);
                    setCmdQuery('');
                  }}
                  style={{
                    background: '#f8fafc',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '8px 14px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    minWidth: '240px',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>🔎 Buscar produtor, evento, repasse…</span>
                  <kbd
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      background: '#e2e8f0',
                      color: '#0f172a',
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}
                  >
                    Ctrl+K
                  </kbd>
                </button>

                {/* Botão de Notificações e Pendências */}
                <button
                  type="button"
                  onClick={() => setNotifOpen(v => !v)}
                  title="Notificações, aprovações e alertas operacionais"
                  style={{
                    position: 'relative',
                    background: notifOpen ? '#f0fdfa' : '#f8fafc',
                    border: `1px solid ${notifOpen ? '#0d9488' : '#cbd5e1'}`,
                    color: '#0f172a',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>🔔</span>
                  {totalNotificacoesAlerta > 0 && (
                    <span
                      style={{
                        background: '#0d9488',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: '999px'
                      }}
                    >
                      {totalNotificacoesAlerta}
                    </span>
                  )}
                </button>

                {/* Dropdown de Notificações */}
                {notifOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '48px',
                      width: '340px',
                      background: '#fff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '12px',
                      boxShadow: '0 14px 34px rgba(15, 23, 42, 0.14)',
                      padding: '14px',
                      zIndex: 60,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>Central de Alertas e Pendências</strong>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#64748b', fontWeight: 800 }}
                      >
                        ✕
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => navegarParaModulo('repasses')}
                      style={{
                        textAlign: 'left',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f766e' }}>
                        Repasses aguardando aprovação: {repassesPendentes}
                      </div>
                      <div className="sub" style={{ fontSize: '11.5px' }}>Clique para abrir a fila de aprovação</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => navegarParaModulo('auditoria_vis')}
                      style={{
                        textAlign: 'left',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>
                        Assinaturas pendentes: {assinaturasPendentes}
                      </div>
                      <div className="sub" style={{ fontSize: '11.5px' }}>Conferir trilha de assinaturas SHA-256</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => navegarParaModulo('conciliacao')}
                      style={{
                        textAlign: 'left',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>
                        Divergências de conciliação OFX: {conciliacoesDivergentes}
                      </div>
                      <div className="sub" style={{ fontSize: '11.5px' }}>Verificar extratos bancários importados</div>
                    </button>
                  </div>
                )}

                <span
                  style={{
                    background: '#f0fdfa',
                    color: '#0f766e',
                    border: '1px solid #99f6e4',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    padding: '7px 12px',
                    borderRadius: '999px',
                    textTransform: 'uppercase',
                    letterSpacing: '.05em'
                  }}
                >
                  Financeiro · role=financeiro
                </span>
                <a
                  href={urlVisaoProdutor}
                  style={{
                    background: '#0d9488',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 800,
                    padding: '8px 14px',
                    borderRadius: '10px',
                    textDecoration: 'none'
                  }}
                >
                  Visão Produtor →
                </a>
                {sessao && (
                  <button
                    className="btn"
                    style={{ background: '#f1f5f9', color: '#334155', minHeight: '36px', padding: '6px 12px', fontSize: '12.5px' }}
                    onClick={() => encerrarSessaoFinanceiro()}
                  >
                    Sair ({sessao.email})
                  </button>
                )}
              </div>
            </header>

            <div style={{ maxWidth: '1420px', width: '100%', margin: '0 auto', padding: '24px 28px 48px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {isGroupDashboard && activeGroupDef ? (
                renderizarDashboardDeGrupo(activeGroupDef)
              ) : activeId === 'inicio' ? (
                <>
                  {/* 6 INDICADORES PRINCIPAIS ALINHADOS HORIZONTALMENTE (Padrão COMPREO) */}
                  <div className="erp-kpi-grid-6">
                    <div className="kpi" style={{ borderTop: '3px solid #0d9488' }}>
                      <span>Saldo disponível</span>
                      <span className="num" style={{ fontSize: '21px', color: '#0f766e' }}>
                        {formatBRL(saldoDisponivelTotal)}
                      </span>
                      <span className="sub">
                        {temDadosSaldos ? `${saldosList.length} produtora(s) ativa(s)` : 'Sem dados disponíveis'}
                      </span>
                    </div>
                    <div className="kpi" style={{ borderTop: '3px solid #0284c7' }}>
                      <span>Liberável nos eventos</span>
                      <span className="num" style={{ fontSize: '20px', color: '#0f172a' }}>
                        {formatBRL(liberavelTotal)}
                      </span>
                      <span className="sub">
                        {eventosEntries.length > 0 ? `${eventosEntries.length} evento(s) calculado(s)` : 'Sem dados disponíveis'}
                      </span>
                    </div>
                    <div className="kpi" style={{ borderTop: '3px solid #f59e0b' }}>
                      <span>Retido por travas</span>
                      <span className="num" style={{ fontSize: '20px', color: '#b45309' }}>
                        {formatBRL(retidoTotal)}
                      </span>
                      <span className="sub">
                        {eventosEntries.length > 0 ? 'Travas de capacidade / receita' : 'Sem dados disponíveis'}
                      </span>
                    </div>
                    <div className="kpi" style={{ borderTop: '3px solid #6366f1' }}>
                      <span>Repassado até hoje</span>
                      <span className="num" style={{ fontSize: '20px', color: '#0f172a' }}>
                        {formatBRL(jaRepassadoTotal)}
                      </span>
                      <span className="sub">
                        {temDadosSaldos ? 'Total líquido liquidado' : 'Sem dados disponíveis'}
                      </span>
                    </div>
                    <div className="kpi" style={{ borderTop: '3px solid #10b981' }}>
                      <span>Eventos abertos</span>
                      <span className="num" style={{ fontSize: '20px', color: '#0f172a' }}>
                        {eventosEntries.length}
                      </span>
                      <span className="sub">Borderôs sincronizados RTDB</span>
                    </div>
                    <div className="kpi" style={{ borderTop: '3px solid #ef4444' }}>
                      <span>Aprovações pendentes</span>
                      <span className="num" style={{ fontSize: '20px', color: aprovacoesPendentesTotal > 0 ? '#b91c1c' : '#0f766e' }}>
                        {aprovacoesPendentesTotal}
                      </span>
                      <span className="sub">
                        {repassesPendentes} repasse(s) · {antecipacoesPendentes} antecip.
                      </span>
                    </div>
                  </div>

                  {/* CENTRAL DE PENDÊNCIAS OPERACIONAIS */}
                  <section className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h2 className="h2">Central de Pendências Operacionais</h2>
                        <p className="sub" style={{ margin: '2px 0 0' }}>
                          Monitoramento em tempo real de solicitações de repasse, assinaturas eletrônicas e conciliação bancária.
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                      <button
                        type="button"
                        onClick={() => navegarParaModulo('repasses')}
                        style={{
                          textAlign: 'left',
                          padding: '16px',
                          borderRadius: '12px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                            Repasses aguardando aprovação
                          </div>
                          <div style={{ fontSize: '12px', color: '#0d9488', fontWeight: 700, marginTop: '4px' }}>
                            Abrir fila de decisão →
                          </div>
                        </div>
                        <span className="num" style={{ fontSize: '26px', color: repassesPendentes > 0 ? '#d97706' : '#0f766e' }}>
                          {repassesPendentes}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navegarParaModulo('auditoria_vis')}
                        style={{
                          textAlign: 'left',
                          padding: '16px',
                          borderRadius: '12px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                            Assinaturas pendentes
                          </div>
                          <div style={{ fontSize: '12px', color: '#0d9488', fontWeight: 700, marginTop: '4px' }}>
                            Conferir governança →
                          </div>
                        </div>
                        <span className="num" style={{ fontSize: '26px', color: assinaturasPendentes > 0 ? '#d97706' : '#0f766e' }}>
                          {assinaturasPendentes}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navegarParaModulo('conciliacao')}
                        style={{
                          textAlign: 'left',
                          padding: '16px',
                          borderRadius: '12px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                            Divergências de conciliação
                          </div>
                          <div style={{ fontSize: '12px', color: '#0d9488', fontWeight: 700, marginTop: '4px' }}>
                            Auditar extratos OFX →
                          </div>
                        </div>
                        <span className="num" style={{ fontSize: '26px', color: conciliacoesDivergentes > 0 ? '#b91c1c' : '#0f766e' }}>
                          {conciliacoesDivergentes}
                        </span>
                      </button>
                    </div>
                  </section>

                  {/* PAINÉIS GRÁFICOS ORGANIZADOS: DISTRIBUIÇÃO DO RESULTADO + VENDAS × TRAVAS */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'stretch' }}>
                    <section className="card" style={{ flex: '1 1 420px', minWidth: 0 }}>
                      <h2 className="h2">Distribuição de saldos e resultado dos eventos</h2>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px' }}>
                        <div
                          style={{
                            position: 'relative',
                            width: '176px',
                            height: '176px',
                            borderRadius: '50%',
                            background: `conic-gradient(${donutGradient})`,
                            flex: 'none'
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              inset: '26px',
                              borderRadius: '50%',
                              background: '#fff',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              textAlign: 'center',
                              padding: '6px'
                            }}
                          >
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                              Total eventos
                            </span>
                            <span className="num" style={{ fontSize: '14px', color: '#0f172a', marginTop: '2px' }}>
                              {formatBRL(jaRepassadoTotal + liberavelTotal + retidoTotal)}
                            </span>
                          </div>
                        </div>
                        <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {[
                            { label: 'Já repassado', v: jaRepassadoTotal, color: '#0d9488' },
                            { label: 'Liberável agora', v: liberavelTotal, color: '#0284c7' },
                            { label: 'Retido por travas', v: retidoTotal, color: '#f59e0b' }
                          ].map(s => (
                            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: s.color }} />
                                {s.label}
                              </span>
                              <span className="num">
                                {formatBRL(s.v)} <span style={{ color: '#64748b' }}>({Math.round((s.v / totDonut) * 100)}%)</span>
                              </span>
                            </div>
                          ))}
                          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>Despesas de eventos lançadas</span>
                            <span className="num" style={{ color: '#0f172a' }}>{formatBRL(totalDespesasValor)}</span>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="card" style={{ flex: '1 1 460px', minWidth: 0 }}>
                      <h2 className="h2">Evolução de vendas × travas de capacidade</h2>
                      {eventosEntries.length === 0 ? (
                        <p className="sub">Sem dados disponíveis de eventos no momento.</p>
                      ) : (
                        eventosEntries.map(([id, ev]) => {
                          const vendidos = Number(ev.ingressosVendidos || 0);
                          const cap = Math.max(1, Number(ev.capacidadeLiberada || 2000));
                          const pct = Math.round((vendidos / cap) * 1000) / 10;
                          const bilheteria = Number(ev.bilheteria || 0);
                          const chip = pct >= 80 ? 'Faixa 75%' : pct >= 50 ? 'Faixa 50%' : pct >= 30 ? 'Faixa 30%' : 'Abaixo do gatilho (30%)';
                          const chipBg = pct >= 30 ? '#ccfbf1' : '#fef3c7';
                          const chipFg = pct >= 30 ? '#0f766e' : '#92400e';
                          return (
                            <div key={id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
                              <div style={{ flex: '2 1 180px' }}>
                                <div style={{ fontWeight: 800 }}>{String(ev.nome || id)}</div>
                                <div className="sub">{String(ev.data || '')}</div>
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: 800, padding: '5px 10px', borderRadius: '999px', background: chipBg, color: chipFg }}>
                                {chip}
                              </span>
                              <div style={{ flex: '2 1 160px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ position: 'relative', height: '10px', background: '#e2e8f0', borderRadius: '999px' }}>
                                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: '999px', background: '#0d9488', width: `${Math.min(100, pct)}%` }} />
                                  {[30, 50, 80].map(g => (
                                    <div key={g} style={{ position: 'absolute', top: '-2px', bottom: '-2px', width: '2px', background: '#f59e0b', left: `${g}%` }} />
                                  ))}
                                </div>
                                <span className="sub" style={{ fontSize: '12px' }}>{pct.toLocaleString('pt-BR')}% vendido ({vendidos}/{cap})</span>
                              </div>
                              <span className="num" style={{ flex: '1 1 110px', textAlign: 'right', color: '#0f766e' }}>
                                {formatBRL(bilheteria)}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </section>
                  </div>

                  <details className="erp-catalog"><summary>Explorar todos os módulos financeiros <span>27 módulos · 9 áreas</span></summary>
                  {/* Filtro rápido do catálogo completo nos 9 grupos */}
                  <label style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                    <span style={{ width: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d9488' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="7" />
                        <path d="M20 20l-3.5-3.5" />
                      </svg>
                    </span>
                    <input
                      aria-label="Buscar módulo financeiro"
                      value={q}
                      onChange={e => setQ(e.target.value)}
                      placeholder="Filtrar módulos nos 9 grupos do ERP Financeiro..."
                      style={{ border: 0, outline: 'none', flex: 1, font: "500 15px 'Manrope', sans-serif", padding: '12px 16px 12px 0', minHeight: '48px', color: '#0f172a', background: 'transparent' }}
                    />
                  </label>

                  {/* Catálogo organizado pelos 9 Grupos COMPREO */}
                  {COMPREO_GROUPS.map(grp => {
                    const modsGrupo = modulosFiltrados
                      .filter(m => MODULE_META[m.id]?.group === grp.id)
                      .sort((a, b) => (MODULE_META[a.id]?.order || 99) - (MODULE_META[b.id]?.order || 99));
                    if (modsGrupo.length === 0) return null;
                    return (
                      <div key={`home-grp-${grp.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="grp">
                            {grp.label} · <span style={{ color: '#0d9488' }}>{grp.compreoRef}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => clicarGrupoSidebar(grp.id)}
                            style={{
                              border: 0,
                              background: 'transparent',
                              color: '#0d9488',
                              fontSize: '12.5px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            Abrir Dashboard da Área →
                          </button>
                        </div>
                        <div className="mods">
                          {modsGrupo.map(mod => {
                            const meta = MODULE_META[mod.id] || {
                              desc: mod.title,
                              shortTitle: mod.title,
                              icon: 'saldo' as const,
                              group: 'cadastros' as const,
                              order: 99
                            };
                            const badge =
                              mod.id === 'saldos'
                                ? formatBRL(saldoDisponivelTotal)
                                : mod.id === 'repasses' && repassesPendentes > 0
                                ? `${repassesPendentes} pendente(s)`
                                : undefined;
                            return (
                              <button key={mod.id} className="mod" onClick={() => navegarParaModulo(mod.id)}>
                                <span className="ic">
                                  <ModuleIcon kind={meta.icon} />
                                </span>
                                <span style={{ flex: 1 }}>
                                  <span className="mtt">{meta.shortTitle}</span>
                                  <span className="mtd">{meta.desc}</span>
                                  {badge ? <span className="bdg">{badge}</span> : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  </details>
                </>
              ) : (
                <main>
                  {activeModule.render(dados, sessao, {
                    navegarPara: navegarParaModulo,
                    filtroProdutoraId,
                    setFiltroProdutoraId,
                    abaInicial: activeId === 'ledger' ? abaContabilInicial : undefined
                  })}
                </main>
              )}
            </div>
          </div>

          {/* BUSCA GLOBAL MODAL (Ctrl+K): Produtor, Evento, Repasse, Contrato ou Operação */}
          {cmdPaletteOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Busca global do ERP Financeiro"
              onClick={() => setCmdPaletteOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.5)',
                zIndex: 100,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '68px 16px 24px'
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%',
                  maxWidth: '640px',
                  background: '#fff',
                  borderRadius: '14px',
                  boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)',
                  border: '1px solid #cbd5e1',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  maxHeight: '80vh'
                }}
              >
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '18px' }}>🔎</span>
                  <input
                    autoFocus
                    value={cmdQuery}
                    onChange={e => setCmdQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (entidadesBuscaGlobal.length > 0) {
                          const first = entidadesBuscaGlobal[0];
                          navegarParaModulo(first.moduloAlvo, first.prodId);
                        } else if (modulosBuscaGlobal.length > 0) {
                          navegarParaModulo(modulosBuscaGlobal[0].id);
                        }
                      }
                    }}
                    placeholder="Localizar produtor, evento, repasse, contrato ou módulo..."
                    style={{
                      flex: 1,
                      border: 0,
                      outline: 'none',
                      fontSize: '15px',
                      fontWeight: 600,
                      color: '#0f172a',
                      fontFamily: "'Manrope', sans-serif"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setCmdPaletteOpen(false)}
                    style={{
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    ESC
                  </button>
                </div>

                <div style={{ overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {entidadesBuscaGlobal.length > 0 && (
                    <>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#0d9488', textTransform: 'uppercase', padding: '4px 6px' }}>
                        Registros Encontrados (Produtores, Eventos, Repasses, Contratos)
                      </div>
                      {entidadesBuscaGlobal.map(ent => (
                        <button
                          key={`${ent.tipo}-${ent.id}`}
                          type="button"
                          onClick={() => navegarParaModulo(ent.moduloAlvo, ent.prodId)}
                          style={{
                            border: '1px solid #e2e8f0',
                            background: '#f0fdfa',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#0f766e', marginRight: '8px' }}>
                              [{ent.tipo}]
                            </span>
                            <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>{ent.titulo}</strong>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>{ent.detalhe}</div>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#0d9488' }}>Abrir →</span>
                        </button>
                      ))}
                    </>
                  )}

                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', padding: '4px 6px' }}>
                    Módulos e Operações ({modulosBuscaGlobal.length})
                  </div>
                  {modulosBuscaGlobal.map(mod => {
                    const meta = MODULE_META[mod.id];
                    const grp = COMPREO_GROUPS.find(g => g.id === meta?.group);
                    return (
                      <button
                        key={`cmd-${mod.id}`}
                        type="button"
                        onClick={() => navegarParaModulo(mod.id)}
                        style={{
                          border: 0,
                          background: activeId === mod.id ? '#f0fdfa' : 'transparent',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              padding: '2px 7px',
                              borderRadius: '999px',
                              background: '#ccfbf1',
                              color: '#0f766e'
                            }}
                          >
                            {grp?.label || 'Geral'}
                          </span>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                            {meta?.shortTitle || mod.title}
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          {meta?.desc || mod.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default App;
