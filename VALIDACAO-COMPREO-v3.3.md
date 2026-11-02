# Consolidação COMPREO — Pacote 3.3

## Alterações realizadas
- Navegação por URL `#inicio`, `#area/<grupo>` e `#modulo/<id>` com suporte a recarregar e aos botões Voltar/Avançar.
- Validação de IDs de módulos antes de navegar.
- Expansão automática do grupo correspondente à rota selecionada e fechamento do menu móvel ao abrir áreas.
- Preferência de sidebar recolhida/expandida persistida no navegador.
- Link de dashboard de área reutiliza a mesma função de navegação da sidebar.
- Catálogo de todos os módulos recolhível na Home, sem remover módulos, dashboards ou funções.
- Ajustes visuais: hover, foco de teclado, contraste, cartões, responsividade.
- Indicadores do dashboard de área renomeados para não classificar registros totais como 'pendências'.

## Escopo preservado
- Fonte das informações financeiras, autenticação Firebase/RBAC e assinaturas RTDB.
- Portal do Produtor; regras de repasse, antecipação, conciliação, ledger e liquidação.
- Nenhuma operação de pagamento, estorno ou transferência foi executada.

## Verificações
- Testes Node do motor financeiro e ERP completo: **63/63 aprovados** (`npm test`), incluindo o teste automatizado `COMPREO v3.3.0`.
- Inspeção estática de registro e categorização de todos os 27 módulos: `python scripts/verificar-compreo.py` (**27/27 módulos catalogados, 9 grupos, navegação e catálogo presentes**).
- Build Vite/TypeScript: **VALIDADO COM SUCESSO** tanto no monorepo (`apps/financeiro` e `apps/produtor`) quanto nos pacotes independentes (`Financeiro_DiskIngressos` e `Portal_Produtor_DiskIngressos`).
- Alterações sincronizadas em `Financeiro_DiskIngressos` e `apps/financeiro`.

## Publicação
Publicar somente em Preview/Homologação após build e testes de acesso. Não implantar automaticamente em produção.
