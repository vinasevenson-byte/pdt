# Financeiro DiskIngressos — Projeto Independente (`v2.1`)

Interface React independente de acesso interno (`http://127.0.0.1:5173`), separada fisicamente do Portal do Produtor.

## Como executar
```bash
npm install
npm run dev
```
Endereço local: `http://localhost:5173`

## Segurança e Conexão Real ao Firebase
- **Guard de Permissão:** Exige autenticação real no Firebase Authentication com Custom Claim `role === 'financeiro'` (`src/shared/firebaseFinanceiro.ts`).
- **Módulos Conectados ao RTDB e Cloud Functions:** Eventos e Travas, Negociações, Repasses (`decidirRepasse`), Antecipações, Advanced, Contas Bancárias, Despesas, Contas a Pagar, Contas a Receber, Saldos por Produtora, Fluxo de Caixa (30/60/90 dias) e Ledger de Partida Dobrada (`/lancamentos` e `/fechamentos`).
- **Sem Movimentação Bancária Externa Automática:** As aprovações e baixas registram memória de cálculo, títulos e lançamentos contábeis auditados sem disparar transferências bancárias externas.
