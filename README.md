# Hub de Repasses DiskIngressos (`diskingressos-62591`) — Monorepo

Arquitetura em monorepo do Hub de Repasses DiskIngressos, preservando 100% do motor de cálculo puro, das regras de segurança do Firebase Realtime Database (`database.rules.json`) e dos testes de aceitação (*Golden Tests*) e segurança, enquanto permite que cada novo módulo financeiro entre como um **plugin padronizado**.

---

## Estrutura do Monorepo

```text
.
├── apps/
│   ├── financeiro/                 # React + Vite + TS (acesso total — role: financeiro)
│   │   └── src/
│   │       ├── app/                # Roteamento, layout e registro de plugins
│   │       ├── modules/            # eventos, negociacoes, repasses, antecipacoes, advanced, contas, despesas, _template
│   │       └── shared/             # Formatadores, contrato FinancialModulePlugin
│   │
│   └── produtor/                   # React + Vite + TS separado (role: produtor)
│       └── src/
│           ├── modules/            # bordero, repasses, antecipacoes, contas, _template
│           └── shared/             # NÃO importa @diskingressos/motor-repasse nem taxas do Disk
│
├── packages/
│   ├── motor-repasse/              # @diskingressos/motor-repasse (cálculo puro + Golden Tests + testes de segurança)
│   ├── contracts/                  # @diskingressos/contracts (schemas e validadores do RTDB)
│   └── firebase-client/            # @diskingressos/firebase-client (config Firebase, claims e auditoria)
│
├── services/
│   ├── functions/                  # Cloud Functions v2 Node 20 (southamerica-east1)
│   │   └── src/
│   │       ├── shared/             # recalculo.js, auditoria
│   │       ├── triggers/           # recalcularPor*
│   │       ├── callables/          # solicitarRepasse, decidirRepasse, solicitarAntecipacao
│   │       └── modules/            # _template e novos handlers por módulo
│   │
│   └── financeiro-java/            # Spring Boot 3 / Java 21 (módulos pesados: conciliação, fiscal, CNAB/remessa, relatórios)
│       ├── pom.xml
│       └── src/main/java/br/com/diskingressos/
│
├── firebase/
│   ├── database.rules.json
│   ├── seed.json
│   ├── firebase.json
│   └── .firebaserc
│
├── scripts/
│   ├── setRole.js                  # Define custom claims (financeiro | produtor)
│   └── new-module.js               # Scaffolder CLI: npm run new:module <nome>
│
└── docs/
    ├── ADR/                        # Architecture Decision Records
    └── modulos.md                  # Guia passo a passo para criar novos módulos
```

---

## Comandos Principais

### 1. Executar todos os testes (Motor + Golden Tests + Segurança de Bundles e RTDB)

```bash
npm test
```

### 2. Criar um novo módulo financeiro plugável

```bash
# Módulo apenas para o Financeiro (Domínio + Contrato + Function + UI Financeiro + Teste)
npm run new:module comissoes

# Módulo com projeção no Produtor e serviço Java
npm run new:module conciliacao -- --produtor --java
```

### 3. Configurar Custom Claims (`role`) no Firebase

```bash
npm run set-role -- financeiro@diskingressos.com.br financeiro
npm run set-role -- contato@produtoraexemplo.com.br produtor prod_exemplo
```
