# Fase 0 — Saneamento de Integridade Financeira e Segurança

## Resumo das Correções Entregues

1. **Regras de Segurança do Firebase RTDB ([firebase/rules.core.json](../firebase/rules.core.json) → [database.rules.json](../database.rules.json))**
   - Removido `.read` e `.write` globais da raiz (`rules`) e `.write` de nós de coleção (`lancamentos`, `repasses`, `antecipacoes`) que cascateavam e anulavam a trava de competência fechada e o `memoriaCalculo: { ".write": false }`.
   - Leitura do produtor habilitada por consulta filtrada (`query.orderByChild === 'produtoraId' && query.equalTo === auth.token.produtoraId`) com `.indexOn: ["produtoraId"]` em `/eventos`, `/repasses`, `/antecipacoes`, `/despesas` e `/advanced`.
   - `/auditoria` tornada **append-only** via `$auditId` (`!data.exists()` e validação de campos obrigatórios).
   - Validação `.validate` de schema e máquina de estados nos registros de repasses, antecipações, lançamentos e fechamentos.

2. **Máquina de Estados e Transação Atômica em `decidirRepasse` ([services/functions/src/callables/index.js](../services/functions/src/callables/index.js))**
   - Transições permitidas estritamente:
     - `Solicitado → Aprovado` (`aprovar`)
     - `Solicitado → Recusado` (`recusar` — cancela a conta a pagar associada)
     - `Solicitado → Pago` (`pagar` direto)
     - `Aprovado → Pago` (`pagar` sem recalcular rateio nem somar `jaRepassado` novamente)
   - Lock transacional atômico (`EmProcessamento`) com **expiração automática de 5 minutos** (`LOCK_TTL_MS`) para evitar corrida de operadores e recuperar locks órfãos.
   - Consulta obrigatória a `/fechamentos` nas Cloud Functions antes de gravar qualquer lançamento contábil.

3. **Consistência do Ledger em Duas Pernas e Fuso Horário de São Paulo ([packages/motor-repasse/src/ledger/index.js](../packages/motor-repasse/src/ledger/index.js))**
   - Liquidação de repasses em duas pernas quando há tarifa:
     - `lnc_rep_<id>`: debita `2.1.01.001 - Obrigações de Repasse Produtor` e credita `1.1.01.001 - Conta Movimento Bancária Disk` pelo `valorLiquido` (idêntico à baixa em `contas_pagar`).
     - `lnc_tar_<id>`: debita `2.1.01.001 - Obrigações de Repasse Produtor` e credita `4.1.02.01 - Receita de Tarifa de Transferência (TED)` pela tarifa, fechando a soma exata com `valorSolicitado`.
   - Data e competência calculadas no fuso `America/Sao_Paulo` (`obterDataAtualBR` e `obterCompetenciaAtualBR`).

4. **Blindagem do `firebase.json` e Unificação de Deploy**
   - `firebase.json` aponta para `services/functions` e ignora pastas internas no Hosting.
   - `functions/index.js` e `functions/motorRepasse.js` delegam para as fontes canônicas.
