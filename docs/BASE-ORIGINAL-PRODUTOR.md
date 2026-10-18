# Base obrigatória: HTML do produtor enviado

O arquivo `legacy/produtor-original/Hub de Repasses – Produtor — acesso limitado.html` é a referência oficial inicial para construção do Hub de Repasses. A cópia é idêntica (SHA-256 em `inventario.json`). Não substituí-la por uma tela genérica.

## O que a inspeção confirmou

- Arquivo HTML autossuficiente no formato de bundle, com manifest de assets compactados, template de interface e runtime.
- Renderização declarativa baseada em componentes React e mecanismo de template `x-dc`/`sc-if`, não um projeto fonte Vite diretamente importável.
- Seções visíveis: tela inicial, **Saldo Consolidado**, **Solicitar Repasse**, **Contas Bancárias**, **Antecipações**, **Despesas**.
- Lógica interna `seed()` com produtora e eventos **de exemplo**, `calcAll()`, formulário de repasse, estados de antecipações e contas bancárias na memória da página.
- Constantes exemplificativas `ANT_PCT = 50` e `ANT_TAXA = 2` que não podem ser tratadas como regras de negócio definitivas.
- O HTML não representa um backend financeiro conectado nem comprova baixas, assinaturas ou transferência bancária real.

## Decisão de arquitetura

1. **Preservação fiel:** manter original imutável em `legacy/`, com hash e assets extraídos para inspeção e refatoração assistida.
2. **Paridade visual e funcional:** reimplementar cada seção no React `apps/produtor` mantendo comportamento e design aprovados; equivalência deve ser conferida por testes e capturas de tela. As telas estruturais do Pacote 01 ainda não são essa reimplementação.
3. **Separação de segurança:** NÃO incluir o arquivo completo em `apps/produtor/public` ou `dist`, pois o HTML contém dados e cálculos de demonstração e precisa de revisão de exposição de regras internas.
4. **Dados reais:** substituir a função `seed()` por projeções autorizadas e somente leitura, isoladas por produtor. Nunca transferir cálculos privados para o navegador.
5. **Fluxos reais:** pedidos de repasse e antecipações devem passar por Cloud Functions autenticadas; nenhuma ação do arquivo legada vale como operação bancária.
6. **Motor de cálculo:** o `calcAll` presente no bundle NÃO substitui o motor financeiro backend oficial; confrontar sua lógica com `motorRepasse.js` e testes, quando esses arquivos forem fornecidos.
7. **Construção ao redor do arquivo:** módulos futuros se conectam ao shell e aos contratos da aplicação, sem eliminar seções ou alterar nomes/totais da tela de referência sem aprovação.

## Mapeamento original → arquitetura

| Seção original | Destino previsto |
| --- | --- |
| Tela inicial | `apps/produtor/src/modules/inicio` |
| Saldo Consolidado | `apps/produtor/src/modules/saldo` |
| Solicitar Repasse | `apps/produtor/src/modules/repasses` |
| Contas Bancárias | `apps/produtor/src/modules/contas` |
| Antecipações | `apps/produtor/src/modules/antecipacoes` |
| Despesas | `apps/produtor/src/modules/despesas` (somente dados permitidos) |
| Borderô embutido nos cálculos | `apps/produtor/src/modules/bordero` |

## Restrição de deploy

Não publicar `legacy/` ou assets extraídos como páginas acessíveis. O script `npm run legado:visualizar` serve apenas para inspeção **local** no navegador; não é parte do deploy. Antes de produção, executar testes de segurança, diff visual, revisão LGPD e verificação de valores fictícios.
