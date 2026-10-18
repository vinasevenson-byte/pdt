# Hub de Repasses DiskIngressos — Separação dos Portais v2.1 (Conectado ao Firebase Real)

O sistema está organizado em **dois portais React independentes** e um **núcleo financeiro compartilhado**, além de manter a estrutura consolidada do monorepo (`apps/`, `packages/`, `services/`, `legacy/`) para rastreabilidade e execução unificada dos testes automatizados.

## 1. Portal do Produtor (`Portal_Produtor_DiskIngressos/` e `apps/produtor/`)
- **Acesso limitado (`http://localhost:5174`)**: Interface React independente, preservando o HTML original intacto em `referencia-original/` e `legacy/produtor-original/` (SHA-256 `d423a4a13ae00048d7d96ea54fd68663a7a98ccc70b5b18c0976b40c98b1f583`).
- **Conexão real e permissões**: Autenticação Firebase Auth exigindo `claims.role === 'produtor'` e `claims.produtoraId`. Leitura em tempo real (`onValue`) estritamente restrita aos nós da própria produtora (`/borderos_produtor/{produtoraId}`, `/contas/{produtoraId}`, `/eventos`, `/repasses`, `/antecipacoes`, `/despesas`), sem dados demonstrativos fixos (`PROJECAO_INICIAL_PRODUTOR` removido) e sem importar o motor financeiro.

## 2. Financeiro Disk (`Financeiro_DiskIngressos/` e `apps/financeiro/`)
- **Acesso interno (`http://localhost:5173`)**: Projeto React separado com guard de autenticação real exigindo `claims.role === 'financeiro'`.
- **Módulos conectados ao RTDB e Cloud Functions**: Eventos e Travas, Negociações, Repasses (`decidirRepasse`), Antecipações, Advanced, Contas Bancárias, Despesas, Contas a Pagar, Contas a Receber, Saldos por Produtora, Fluxo de Caixa (30/60/90 dias) e Ledger de Partida Dobrada (`/lancamentos` e `/fechamentos`).
- **Segurança operacional**: Nenhuma transferência bancária externa automática está habilitada.

## 3. Núcleo Financeiro Compartilhado (`Nucleo_Financeiro_Compartilhado/`)
- Contém o motor de cálculo validado (`motorRepasse.js` e `packages/motor-repasse`), contratos (`packages/contracts`), Cloud Functions (`services/functions` e `functions/`), regras de segurança do RTDB (`firebase/database.rules.json`) e o serviço Spring Boot (`services/financeiro-java`).

## Como executar cada portal de forma independente

| Portal          | Diretório                         | Comando                      | Endereço local          |
| --------------- | --------------------------------- | ---------------------------- | ----------------------- |
| Financeiro Disk | `Financeiro_DiskIngressos/`       | `npm install && npm run dev` | `http://localhost:5173` |
| Produtor        | `Portal_Produtor_DiskIngressos/`  | `npm install && npm run dev` | `http://localhost:5174` |
