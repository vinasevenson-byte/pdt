# Fechamento Mensal Contábil (`previaFechamento`, `fecharCompetencia` e `reabrirCompetencia`)

## 1. Visão Geral
O fechamento mensal do Ledger (`/lancamentos` e `/fechamentos`) foi reestruturado para substituir o `set` simples anterior (que aceitava mês futuro, sobrescrevia fechamentos sem cálculo e permitia escrita direta pelo cliente) por três Cloud Functions Callables em [`services/functions/src/modules/financeiro_core/index.js`](../services/functions/src/modules/financeiro_core/index.js) apoiadas na biblioteca pura em [`packages/motor-repasse/src/ledger/index.js`](../packages/motor-repasse/src/ledger/index.js):

1. **`previaFechamento` (`executarPreviaFechamento`)**:
   - Operação **somente leitura**.
   - Retorna bloqueios, avisos e o **balancete por conta contábil** (`debito`, `credito`, `saldo`, `totalDebitosCents`, `totalCreditosCents`).
   - Se a competência já estiver fechada, recalcula o selo SHA-256 sobre os lançamentos atuais e confere contra `seloSha256` gravado, acusando qualquer adulteração (`adulteracao_detectada`).
2. **`fecharCompetencia` (`executarFecharCompetencia`)**:
   - Permite fechar **apenas meses já encerrados** (`competencia < competenciaAtual` no fuso `America/Sao_Paulo`) e **em sequência cronológica** (`jan`, depois `fev`, e assim por diante).
   - Executa em 4 etapas:
     1. **Pré-checagem** de bloqueios e sequência;
     2. **Trava transacional** em `/fechamentos/{competencia}` (`emFechamento: true`, `status: 'Fechando'`);
     3. **Recálculo sob trava** (enquanto a trava está ativa, `decidirRepasse`, `estornarRepasse`, `decidirAntecipacao` e as regras do RTDB recusam qualquer lançamento novo naquela competência);
     4. **Selagem SHA-256 e gravação** (`versao`, `seloSha256`, `seloAnterior`, `resumoBalancete`, `historicoReaberturas`), auditoria em `/auditoria` e evento em `/eventos_dominio`.
3. **`reabrirCompetencia` (`executarReabrirCompetencia`)**:
   - Permite reabrir **exclusivamente a última competência fechada** (ex.: se `2026-01` e `2026-02` estão fechadas, não é permitido reabrir `2026-01` enquanto `2026-02` estiver fechada).
   - Exige `motivo` obrigatório (mínimo de 5 caracteres).
   - Exige **segregação de funções**: o operador que fechou a competência não pode reabri-la (desligável apenas fora de produção com `FECHAMENTO_SEGREGACAO=false`).
   - Mantém histórico permanente em `historicoReaberturas`. Ao refechar, gera `versao: versaoAnterior + 1` e preserva `seloAnterior`.

---

## 2. O que Bloqueia o Fechamento
A função pura `calcularPreviaFechamento` impede o fechamento se houver qualquer um dos seguintes bloqueios:

| Código do Bloqueio | Regra Verificada |
| :--- | :--- |
| `competencia_em_curso_ou_futura` | Tentativa de fechar o mês corrente ou um mês futuro (`competencia >= competenciaAtual`). |
| `sequencia_violada` | Tentativa de fechar uma competência quando a competência imediatamente anterior ainda está aberta. |
| `lancamento_invalido` | Lançamento sem `contaDebito`/`contaCredito`, com contas idênticas, valor não inteiro positivo em centavos, divergência entre `valor` e `valorCents` ou `imutavel === false`. |
| `balancete_desbalanceado` | Soma de débitos diferente da soma de créditos na competência (`totalDebitosCents !== totalCreditosCents`). |
| `repasse_pago_sem_lancamento` | Repasse com `status === 'Pago'` liquidado na competência sem o lançamento correspondente (`lnc_rep_${repasseId}`) ou com valor divergente. |
| `devolucao_sem_contrapartida` | Repasse `Pago -> Estornado` na competência sem lançamento de estorno (`lnc_est_rep_${repasseId}`) ou lançamento `tipo === 'estorno'` sem lançamento original válido/invertido. |
| `adulteracao_detectada` | Competência já fechada cujo `seloSha256` gravado diverge do hash SHA-256 calculado sobre os lançamentos atuais. |

---

## 3. Regras do Banco (`firebase/rules.core.json`)
- `/fechamentos`: leitura restrita a `role === 'financeiro'` e **escrita bloqueada para clientes (`.write: false`)** — apenas o servidor grava via Admin SDK.
- `/lancamentos`: índice `.indexOn: ["competencia", "produtoraId", "eventoId", "origemId"]` e bloqueio de escrita quando `fechado === true` **ou** `emFechamento === true`.

---

## 4. Pontos de Atenção e Decisões
- **Janela residual:** um lançamento que passou na checagem um instante antes da trava pode entrar depois do selo caso escrito fora do fluxo transacional; não corrompe silenciosamente porque `previaFechamento` acusa `adulteracao_detectada` no selo SHA-256.
- **Primeiro fechamento:** se o ledger possui lançamentos antigos, a regra de sequência exige fechar mês a mês a partir do primeiro mês com movimentação.
- **Fechamentos legados sem selo:** continuam bloqueando lançamentos retroativos, mas exibem o aviso `fechamento_sem_selo` até serem reabertos e refechados.
- **Simulador local:** o servidor local de desenvolvimento (`scripts/local-rtdb-server.mjs`) não executa as Cloud Functions de fechamento; a tela **Fechamento Mensal** em [`apps/financeiro/src/modules/fechamento/index.tsx`](../apps/financeiro/src/modules/fechamento/index.tsx) exibe aviso explícito nesse modo.
