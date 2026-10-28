# Catálogo de Módulos Verticais Registrados (Gerado Automaticamente)

> Gerado por `npm run module:build`. Total de módulos verticais em `modules/`: **13**.

| ID | Domínio | Título | Nó RTDB | Camada | Produtor vê? | Dependências |
|---|---|---|---|---|---|---|
| `admin/auditoria_vis` | admin | Visualizador de Auditoria e Assinaturas | `/auditoria_relatorios` | node | não | core, auditoria, eventos_dominio |
| `admin/fornecedores` | admin | Fornecedores e Compras Operacionais | `/fornecedores_op` | node | não | core, eventos, contas_pagar |
| `admin/usuarios` | admin | Usuários, Papéis (RBAC) e Alçadas | `/usuarios_erp` | node | não | core, auditoria |
| `comercial/contratos` | comercial | Contratos | `/contratos` | node | sim (dono) | core |
| `financeiro/chargebacks` | financeiro | Chargebacks | `/chargebacks` | node | não | core |
| `financeiro/cobranca` | financeiro | Cobrança, Inadimplência e Devedores | `/cobrancas_devedores` | node | sim (dono) | core, saldos, contas_receber |
| `financeiro/conciliacao` | financeiro | Conciliacao | `/conciliacoes` | java | não | core |
| `financeiro/fiscal` | financeiro | Fiscal | `/apuracoes_fiscais` | node | não | core |
| `financeiro/recebiveis` | financeiro | Recebíveis de Gateway e Adquirente | `/recebiveis_agenda` | node | não | core, ledger, contas_receber |
| `financeiro/remessa` | financeiro | Remessa | `/remessas` | node | não | core |
| `operacao/vendas` | operacao | Vendas, Lotes e Cortesias | `/vendas_lotes` | node | sim (dono) | core, eventos, contas_receber |
| `plataforma/bi_executivo` | plataforma | BI Executivo e DRE Gerencial | `/bi_executivo` | node | não | core, ledger, saldos, contas_pagar, contas_receber |
| `plataforma/notificacoes` | plataforma | Notificações, Alertas e Jobs | `/notificacoes_central` | node | sim (dono) | core, eventos_dominio, repasses, contas_pagar |
