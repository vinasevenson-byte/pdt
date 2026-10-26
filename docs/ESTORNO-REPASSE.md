# Fluxo de Estorno e Cancelamento de Repasses (`estornarRepasse`)

## Visão Geral

O callable `estornarRepasse` (também acionável via `decidirRepasse` com `acao: "estornar"`) implementa o cancelamento de repasses `Aprovado` e a devolução contábil de repasses `Pago`, sob trava transacional atômica (`/repasses/{repasseId}`).

## Comportamento por Status

1. **Repasse `Aprovado` (Cancelamento Administrativo)**
   - Reverte o saldo `jaRepassado` de cada evento utilizando `memoriaCalculo.rateioAplicado`.
   - Restaura `abaterNoProximo = true` nos itens de `advanced` e `antecipacoes` registrados em `memoriaCalculo.abatimentosAplicados`.
   - Atualiza `/contas_pagar/cp_rep_{repasseId}/status` para `Cancelada`.
   - Não gera lançamento em `/lancamentos` (pois o repasse ainda não havia sido liquidado no banco).

2. **Repasse `Pago` (Devolução Bancária e Estorno Contábil)**
   - Exige obrigatoriamente o `protocoloDevolucao` bancário.
   - Verifica se a competência atual (fuso `America/Sao_Paulo`) está aberta em `/fechamentos`. Caso esteja encerrada, bloqueia a operação.
   - Reverte `jaRepassado`, restaura abatimentos e cancela o título em `/contas_pagar`.
   - Gera contrapartidas imutáveis no Ledger (`/lancamentos/lnc_est_rep_{id}` e `/lancamentos/lnc_est_tar_{id}`) com débito e crédito invertidos na competência atual.

## Segregação de Funções (`ESTORNO_SEGREGACAO`)

- O operador que aprovou (em repasse `Aprovado`) ou liquidou (em repasse `Pago`) **não pode** estornar o mesmo repasse.
- A trava fica no código das Cloud Functions e só pode ser desativada em ambiente de desenvolvimento via variável de ambiente `ESTORNO_SEGREGACAO=false` (fora do RTDB para impedir desativação pelo próprio painel).

## Isolamento do Produtor (`/estornos`)

- No nó `/repasses/{repasseId}`, o produtor enxerga apenas `status: "Estornado"` e `estornadoEm`.
- O motivo interno, o protocolo de devolução e a assinatura do estorno são gravados exclusivamente em `/estornos/est_{repasseId}`, nó restrito ao perfil `financeiro` nas regras do RTDB (`firebase/rules.core.json`).

## Compatibilidade com Repasses Legados

- Repasses aprovados antes desta versão (como `rep_hist_1` no `seed.json`) não possuem `memoriaCalculo.abatimentosAplicados`.
- Nesses casos, o estorno reverte `jaRepassado` normalmente, retorna `restauracaoAbatimentos: "manual"` e registra uma advertência explícita em `/auditoria` para conferência manual de `advanced` e `antecipacoes`.
