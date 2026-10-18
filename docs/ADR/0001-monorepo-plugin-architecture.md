# ADR 0001 — Arquitetura em Monorepo com Módulos Financeiros Plugáveis e Isolamento de Bundles

- **Status:** Aceito
- **Data:** Outubro de 2026
- **Projeto:** Hub de Repasses DiskIngressos (`diskingressos-62591`)

## Contexto

O Hub de Repasses possui regras estritas de confidencialidade comercial: o Produtor jamais pode ter acesso às taxas internas do Disk (`taxaAdm`, `taxaOp`, `conveniencia`), nem às coleções `/eventos_fin`, `/negociacoes` e `/auditoria`. Ao mesmo tempo, novos módulos financeiros (conciliação bancária, fiscal/ISS, CNAB/remessa, comissões, relatórios) precisam ser adicionados sem inflar ou acoplar o núcleo de cálculo.

## Decisões

1. **Dois aplicativos React independentes (`apps/financeiro` e `apps/produtor`):**
   - `apps/produtor` depende exclusivamente de `@diskingressos/contracts` e `@diskingressos/firebase-client`.
   - O teste automatizado de segurança (`packages/motor-repasse/test/motorRepasse.test.js`) inspeciona todo o código-fonte e o bundle de `apps/produtor` garantindo ausência total de termos restritos e de importação de `@diskingressos/motor-repasse`.
2. **Projeção limpa no servidor (`/borderos_produtor/{produtoraId}`):**
   - Toda consolidação e borderô do produtor é gravada pelas Cloud Functions no servidor via `bordero_produtor()`.
3. **Motor único de cálculo (`@diskingressos/motor-repasse`):**
   - Mantém funções 100% puras e determinísticas, testadas contra os *Golden Tests* do `firebase/seed.json` (Polaquedo = R$ 240,00; Festival = R$ 4.816,00; Stand-up = R$ 0,00; Consolidado = R$ 4.056,00).
4. **Serviço Java (`services/financeiro-java`) sob demanda:**
   - Utilizado apenas para processamento pesado em lote (CNAB/remessa, conciliação bancária, obrigações fiscais e exportações PDF/XLSX).
   - Valida o ID Token do Firebase exigindo `role === "financeiro"` e nunca escreve diretamente nos nós que disparam os triggers de recálculo do Node, evitando loops.
5. **Auditoria obrigatória (`/auditoria`):**
   - Todo módulo novo registra suas ações em `/auditoria` usando o helper compartilhado.
