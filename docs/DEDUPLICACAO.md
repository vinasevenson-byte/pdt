# Plano e Controles de Deduplicação do Monorepo

## Fontes Canônicas vs. Espelhos Sincronizados

| Artefato | Fonte Canônica (Editar Aqui) | Espelhos Sincronizados Automaticamente |
|---|---|---|
| **Regras RTDB** | `firebase/rules.core.json` + `modules/*/*/manifest.json` | `database.rules.json`, `firebase/database.rules.json` (via `npm run module:build`) |
| **Motor Financeiro** | `packages/motor-repasse/src/` | `motorRepasse.js` (raiz) e `functions/motorRepasse.js` (reexport) |
| **Cloud Functions** | `services/functions/src/` | `functions/index.js` (reexport direto) |
| **Script de Claims** | `scripts/setRole.js` | `setRole.js` (delega para `scripts/setRole.js`) |
| **Apps React** | `apps/financeiro` e `apps/produtor` | `Financeiro_DiskIngressos/` e `Portal_Produtor_DiskIngressos/` |

## Verificação Automatizada

A suíte `npm test` (em `tests/fase0-saneamento.test.mjs`) e `npm run module:check` falham imediatamente caso qualquer espelho divergir da sua fonte canônica.
