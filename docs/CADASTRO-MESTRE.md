# Cadastro Mestre — Fase 3, Módulo 1

## Visão Geral
Antes deste módulo, `/produtoras`, `/locais` e `/eventos` eram nós carregados apenas por seed, e as regras do RTDB permitiam que qualquer cliente autenticado como Financeiro sobrescrevesse o nó inteiro — inclusive `jaRepassado`, `vendas` e `bilheteria`.

Agora as escritas diretas do cliente em `/produtoras`, `/locais`, `/eventos` e `/cadastro_cnpj` estão bloqueadas (`.write: false`), e toda criação, edição, inativação ou reativação ocorre exclusivamente via 4 Cloud Functions callables com RBAC (`cadastro:gerenciar`):

1. **`salvarProdutora`** (`services/functions/src/modules/cadastro_core/index.js`)
2. **`salvarLocal`** (`services/functions/src/modules/cadastro_core/index.js`)
3. **`salvarEvento`** (`services/functions/src/modules/cadastro_core/index.js`)
4. **`alterarStatusCadastro`** (`services/functions/src/modules/cadastro_core/index.js`)

## Regras de Domínio (`packages/motor-repasse/src/cadastro/index.js`)
- **Identificadores de caminho RTDB:** devem conter apenas `[a-z0-9_]` (entre 3 e 48 caracteres). Quando omitidos na criação, são gerados com prefixo (`prod_`, `loc_`, `evt_`).
- **CNPJ:**
  - Dígitos verificadores validados pelo algoritmo oficial Módulo 11.
  - Único entre todas as produtoras. Além da varredura, `salvarProdutora` executa `.transaction()` em `/cadastro_cnpj/{cnpjDigitos}` para impedir cadastros concorrentes com o mesmo CNPJ.
  - *Compatibilidade com seed:* o CNPJ fictício de exemplo do seed (`14.890.321/0001-55`) permanece editável desde que não seja alterado; qualquer CNPJ novo ou alterado passa pela validação de dígitos verificadores.
- **Dono do evento imutável:** `produtoraId` não pode ser alterado após a criação do evento, pois mover o evento deslocaria saldo, extrato e ledger.
- **Local do evento travado após vendas:** `localId` não pode ser alterado depois que o evento possui ingressos vendidos, cortesias ou valor já repassado.
- **Teto de capacidade:** a capacidade configurada de um evento nunca pode ficar abaixo dos ingressos já contados (`vendidos` ou `vendidos + cortesias` quando `contarCortesias: true`). Editar os setores de um local (`salvarLocal`) também valida todos os eventos vinculados para garantir que nenhum setor aberto desapareça nem reduza a capacidade abaixo do público já vendido.
- **Proteção e corrida dos campos financeiros:**
  - `salvarEvento` recusa payloads que enviem `jaRepassado`, `vendas` ou `bilheteria`.
  - Novos eventos nascem com `jaRepassado: 0`, `vendas: { vendidos: 0, cortesias: 0 }`, `bilheteria: {}` e `/eventos_fin/{id}` zerado.
  - Na edição, `salvarEvento` aplica `.transaction()` em `/eventos/{id}` preservando os valores atuais de `jaRepassado`, `vendas` e `bilheteria` mesmo que `decidirRepasse` aprove um repasse no mesmo instante.
- **Inativação e Reativação (`alterarStatusCadastro`):**
  - Nada é apagado do banco.
  - Inativar exige `motivo` obrigatório.
  - Bloqueia inativar produtora com eventos ativos ou repasses/antecipações em andamento (`Solicitado`, `Aprovado`, `Aprovada`).
  - Bloqueia inativar local com eventos ativos vinculados.
  - Bloqueia inativar evento com repasse ou antecipação em andamento.
  - Ao inativar um evento (ou sua produtora/local), `liberadoParaSolicitacao` passa a `false` e `recalcularTodaProdutora` recompõe os saldos e a visão pública do produtor.
