# Guia de Criação de Novos Módulos Financeiros

Cada novo módulo financeiro (ex.: `conciliacao`, `fiscal`, `comissoes`, `remessa`) entra no monorepo como um plugin padronizado em até 7 camadas.

## Gerador Automático (`new:module`)

Execute na raiz do repositório:

```bash
# Módulo exclusivo do Financeiro (Node + React Financeiro)
npm run new:module comissoes

# Módulo com projeção limpa no Produtor e serviço pesado em Java
npm run new:module conciliacao -- --produtor --java
```

## Camadas de um Módulo

| Camada | Caminho | Responsabilidade |
|---|---|---|
| **Domínio** | `packages/motor-repasse/src/modules/<modulo>/index.js` | Funções puras de cálculo (sem I/O, sem Firebase) |
| **Contrato** | `packages/contracts/src/<modulo>/index.js` | Nome do nó no RTDB e validação de schema |
| **Regras RTDB** | `firebase/database.rules.json` | Controle de leitura/escrita por `auth.token.role` |
| **Backend** | `services/functions/src/modules/<modulo>` ou `services/financeiro-java/.../<modulo>` | Callables/triggers Node ou endpoints REST Spring Boot |
| **UI Financeiro** | `apps/financeiro/src/modules/<modulo>/index.tsx` | Aba/página que implementa `FinancialModulePlugin` |
| **UI Produtor** | `apps/produtor/src/modules/<modulo>/index.tsx` | *(Opcional)* Somente leitura da projeção limpa |
| **Testes** | `packages/motor-repasse/test/<modulo>.test.js` | Testes unitários + checagem de segurança |

## Checklist Obrigatório antes do Deploy

1. O módulo grava todas as decisões/alterações em `/auditoria`?
2. O nó em `firebase/database.rules.json` exige `auth.token.role === 'financeiro'` para escrita?
3. Se houver visualização para o produtor, ela evita 100% os termos `taxaAdm`, `taxaOp`, `conveniencia`, `eventos_fin` e `negociacoes`?
4. `npm test` passa sem erros?
