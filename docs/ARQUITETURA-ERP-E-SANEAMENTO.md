# Diagnóstico Arquitetural, Fase 0 (Concluída) e Catálogo ERP (4 Domínios)

Este documento consolida o diagnóstico técnico do repositório, registra as correções aplicadas na **Fase 0 — Saneamento** e define a estrutura de expansão para ERP cobrindo os 4 domínios confirmados: **Financeiro**, **Comercial**, **Operação de Vendas** e **Admin/Plataforma**.

---

## 1. Status da Fase 0 — Saneamento (Concluída e Validada por Testes)

| Item | Risco Diagnosticado | Correção Aplicada | Arquivo(s) / Teste |
|---|---|---|---|
| **1. Regras RTDB** | `.read` e `.write` na raiz (`rules`) e `.write` no pai `lancamentos` cascateavam, anulando a imutabilidade do Ledger, a trava de `/fechamentos` e o `memoriaCalculo: .write false`. | Removidos `.read`/`.write` da raiz e `.write` dos nós pais `lancamentos`, `repasses` e `antecipacoes`. Adicionados `.validate` de schema, titularidade de `eventoId`/`contaId` e máquina de estados. | `database.rules.json`, `firebase/database.rules.json`, `tests/fase0-saneamento.test.mjs` |
| **2. Máquina de Estados e Concorrência (`decidirRepasse`)** | Aprovar repasse já Aprovado/Pago duplicava `jaRepassado`; recusar repasse Pago era aceito; dois operadores simultâneos geravam corrida. | Implementados `validarTransicaoRepasse` (`Solicitado -> Aprovado\|Recusado\|Pago`, `Aprovado -> Pago`) e lock transacional atômico (`adquirirLockTransacionalRepasse`) com rollback automático. | `services/functions/src/callables/index.js` |
| **3. Consistência do Ledger e Fuso Horário** | Divergência entre `valorSolicitado` (Ledger) e `valorLiquido` (`contas_pagar`), competência gerada por `toISOString()` em UTC (virava o mês às 21h BRT) e contas contábeis em texto livre. | Criados `PLANO_CONTAS`, `obterDataAtualBR` e `obterCompetenciaAtualBR` (`America/Sao_Paulo`). Alinhados `contas_pagar` e `lancamentos` em centavos (`valorLiquidoCents` + lançamento separado de tarifa TED `lnc_tar_*`) e validação obrigatória de `/fechamentos` nas Cloud Functions. | `packages/motor-repasse/src/ledger/index.js`, `packages/motor-repasse/src/contas/index.js`, `services/functions/src/callables/index.js` |
| **4. Criação direta no RTDB pelo Produtor** | Produtor conseguia gravar em `/repasses` e `/antecipacoes` sem validar titularidade de evento/conta no banco. | Adicionados `.validate` exigindo `/contas/$produtoraId/$contaId/status === 'Validada'` nos repasses e `/eventos/$eventoId/produtoraId === newData.produtoraId` nas antecipações. | `database.rules.json` |
| **5, 6 & 7. Duplicação, Deploy e Aritmética** | `firebase.json` apontava para `functions/` legado (601 linhas), Hosting expunha pastas internas e havia 3 cópias divergentes de `motorRepasse.js`. | `firebase.json` aponta para `services/functions` e blinda `hosting.ignore`; `functions/index.js` e `functions/motorRepasse.js` delegam para as fontes únicas da verdade; aritmética em centavos unificada no motor. | `firebase.json`, `functions/index.js`, `packages/motor-repasse/src/index.js` |

---

## 2. Arquitetura de Expansão para ERP (Módulos Verticais com Manifesto)

Para suportar o crescimento nos 4 domínios sem tocar 7 pastas manualmente a cada módulo:

```text
modules/<dominio>/<modulo>/
├── manifest.json        # id, domínio, roles, nós RTDB, dependências, eventos, featureFlag
├── domain/              # funções puras (aritmética em centavos)
├── contract/            # schema + validação
├── rules.fragment.json  # trecho de regras RTDB, mesclado no build
├── functions/           # callables/triggers Node (ou integração java/)
├── ui/                  # tela no portal Financeiro/Interno
├── ui-produtor/         # (opcional) tela somente leitura da projeção limpa no Portal do Produtor
└── test/                # testes unitários + segurança de isolamento

packages/
├── core/                # registro automático de módulos, RBAC granular, feature flags, auditoria
├── ledger/              # plano de contas, lançamentos imutáveis, fechamento (único escritor contábil)
├── ui-kit/              # tabela, formulário, filtros, modais de confirmação/assinatura
├── contracts/           # validadores compartilhados
└── firebase-client/     # conectores tipados
```

---

## 3. Catálogo Oficial de Módulos (Escopo Completo: 4 Domínios)

| Domínio | Módulo | Camada Principal | Visão do Produtor | Dependências |
|---|---|---|---|---|
| **1. Financeiro** | **Repasses e Travas (Borderô)** | Node + Motor Puro | Sim (`/borderos_produtor`) | `ledger`, `contas_pagar` |
| | **Ledger e Fechamento Mensal** | Node / Java | Não | `core` |
| | **Contas a Pagar e a Receber** | Node | Não | `ledger` |
| | **Conciliação Bancária (OFX/Retorno)** | Java (Spring Boot) | Não | `ledger`, `contas_pagar` |
| | **Remessa CNAB / PIX em Lote** | Java (Spring Boot) | Comprovante | `repasses`, dupla aprovação |
| | **Fiscal e Retenções (ISS, ECAD, IR)** | Java (Spring Boot) | Resumo no borderô | `ledger`, `contas_pagar` |
| | **Recebíveis de Gateway/Adquirente** | Node | Não | `contas_receber`, `vendas` |
| | **Estornos e Chargebacks** | Node | Parcial (impacto em vendas) | `ledger`, `recebiveis` |
| | **Comissões, Rebate, Spread e Advanced** | Node (Motor Puro) | Parcial (créditos/abatimentos) | `negociacoes`, `ledger` |
| | **Cobrança e Inadimplência (Devedores)** | Node | Sim (posição de saldo) | `saldos` |
| | **Orçamento × Realizado e DRE** | Java (Spring Boot) | Não | `ledger` (Plano de Contas) |
| **2. Comercial** | **Cadastro Mestre (Produtoras, Eventos, Locais)** | Node | Sim (seus eventos/locais) | `core` |
| | **Contratos, Negociações e Aditivos Versionados** | Node | Resumo comercial (sem taxas internas Disk) | `cadastro_mestre` |
| | **CRM e Propostas Comerciais** | Node | Não | `cadastro_mestre` |
| **3. Operação de Vendas** | **Vendas, Lotes e Borderô Oficial** | Node | Sim (`/borderos_produtor`) | `cadastro_mestre`, `contratos` |
| | **Cortesias, Cotas e Cortes** | Node | Sim | `vendas` |
| **4. Admin e Plataforma** | **Usuários, Papéis (RBAC) e Alçadas** | Node | Não | `core` |
| | **Visualizador de Auditoria e Assinaturas** | Node | Não | `core` (`/auditoria`) |
| | **Fornecedores e Compras Operacionais** | Node | Parcial (despesas do evento) | `contas_pagar` |
| | **Notificações e Jobs (E-mail/WhatsApp/Vencimentos)** | Node | Sim (alertas de repasse) | `eventos_dominio` |
| | **BI, Dashboards Executivos e API/Webhooks** | Java / Node | Parcial (dashboard produtor) | Todos os domínios |

---

## 4. Próximas Fases

- **Fase 1 — Fundação ERP:** Criar `packages/core` (RBAC granular: `operador`, `aprovador`, `auditor`, `fiscal`, `comercial`, `produtor`), `packages/ui-kit`, e o compilador de `manifest.json` que gera automaticamente o registro de módulos da UI, o `database.rules.json` e o índice de Functions.
- **Fase 2 — Fechamento do Domínio Financeiro:** Plano de contas gerenciável, conciliação OFX, remessa CNAB/PIX com dupla aprovação e módulo de estornos/chargebacks.
- **Fase 3 — Comercial e Operação de Vendas:** Cadastro mestre unificado, versionamento de contratos/negociações, ingestão de vendas/cortesias alimentando o motor automaticamente.
- **Fase 4 — Admin, Notificações e BI:** Gestão visual de usuários/claims (substituindo uso exclusivo via CLI), trilha de auditoria pesquisável e painéis analíticos.
