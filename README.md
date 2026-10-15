# Hub de Repasses DiskIngressos (`diskingressos-62591`)

Módulo financeiro completo de apuração de borderô, travas por resultado (Regra A) e capacidade vendida em faixas (Regra B), créditos comerciais limitados à Taxa Adm do Disk, adiantamentos (`Advanced`), antecipações e solicitações de repasse com isolamento estrito entre os perfis **Financeiro** e **Produtor**.

---

## Estrutura de Arquivos

- `index.html` — Portal de entrada para abrir a visão do **Financeiro** ou do **Produtor**.
- `financeiro.html` — Painel do **Financeiro (acesso total)** com 8 módulos (*Eventos e travas*, *Negociações*, *Saldo consolidado*, *Solicitações de repasse*, *Antecipações*, *Advanced*, *Contas bancárias* e *Despesas*) e prévia ao vivo via `motorRepasse.js`.
- `produtor.html` — Painel do **Produtor (acesso limitado)** que lê exclusivamente `/borderos_produtor/{produtoraId}` e seus próprios registros, sem importar `motorRepasse.js` e sem nenhum campo ou menção às taxas do Disk.
- `motorRepasse.js` — Motor de cálculo puro compartilhado entre `financeiro.html` e Cloud Functions (`capacidadeUsada`, `calcEvento`, `calcConsolidado`, `bordero_produtor`, `calcTransferencia`, `somarDiasUteis`).
- `motorRepasse.test.js` — Suíte de testes unitários, de aceitação (Prompt 7) e de segurança (`node --test motorRepasse.test.js`).
- `database.rules.json` — Regras de segurança do Firebase Realtime Database.
- `setRole.js` — Script CLI (`firebase-admin`) para definir Custom Claims (`financeiro` ou `produtor` + `produtoraId`).
- `seed.json` — Base inicial com os 3 eventos de validação (*Polaquedo*, *Festival de Inverno*, *Noite de Stand-up*) e `/borderos_produtor` pré-calculado.
- `functions/index.js` & `functions/package.json` — Cloud Functions v2 (`southamerica-east1`, Node 20): triggers `recalcularPor*` e callables `solicitarRepasse`, `decidirRepasse` e `solicitarAntecipacao`.
- `firebase.json` & `.firebaserc` — Configuração pronta para deploy no projeto `diskingressos-62591`.

---

## Como Executar os Testes

```bash
npm test
# ou diretamente:
node --test motorRepasse.test.js
```

## Como Configurar Perfis (Custom Claims)

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/caminho/serviceAccountKey.json"

# Perfil Financeiro (acesso total)
node setRole.js financeiro@diskingressos.com.br financeiro

# Perfil Produtor (restrito à produtora)
node setRole.js contato@produtoraexemplo.com.br produtor prod_exemplo
```

## Deploy no Firebase

```bash
cd functions && npm install && cd ..
firebase deploy
```
