# Guia de Módulos Verticais com Manifesto (v2)

Cada módulo de negócio vive isolado em `modules/<dominio>/<modulo>/` com um `manifest.json` declarativo. O passo de build valida o manifesto e gera automaticamente as regras do RTDB, o registro de UI (Financeiro e Produtor), o índice de Cloud Functions e o catálogo.

## Comandos

```bash
# Criar módulo financeiro apenas servidor/interno (Node)
npm run module:new -- financeiro/estornos --no estornos

# Criar módulo financeiro com backend Java (Spring Boot)
npm run module:new -- financeiro/conciliacao --no conciliacoes --java

# Criar módulo comercial com leitura do próprio produtor no RTDB e UI no Portal do Produtor
npm run module:new -- comercial/contratos --no contratos --produtor dono

# Validar manifestos e regenerar regras, registros de UI/Functions e catálogo
npm run module:build

# Verificar se os artefatos gerados estão sincronizados (CI / pre-deploy)
npm run module:check
```

## Estrutura Gerada por Módulo

```text
modules/<dominio>/<modulo>/
├── manifest.json        # id, domínio, camada, rtdb (nó, leituraProdutor, escritaCliente), ui, dependências
├── domain/index.js      # funções puras em centavos inteiros
├── contract/index.js    # schema e validador do nó RTDB
├── functions/index.js   # callable Node com RBAC e auditoria (ou java/<Modulo>Service.java se --java)
├── ui/index.tsx         # plugin React para o portal Financeiro
├── ui-produtor/         # (opcional, se --produtor) componente limpo para o Portal do Produtor
└── test/module.test.js  # testes unitários do módulo
```

## Travas de Segurança do `module:build`

O compilador bloqueia automaticamente:
1. **Colisão de nó RTDB** com nós do núcleo (`firebase/rules.core.json`) ou com outro módulo.
2. **Dependência inexistente ou cíclica** entre módulos (detecção por busca em profundidade — DFS).
3. **UI do Produtor sem permissão de leitura declarada** (`ui.produtor: true` exige `rtdb.leituraProdutor: "dono"` ou `"projecao"`).
4. **Vazamento de termos internos na UI do Produtor** (`taxaAdm`, `taxaOp`, `conveniencia`, `eventos_fin`, `negociacoes`, `motorRepasse`).
5. **Divergência entre pasta e manifesto** (`dominio` ou `modulo` diferente da estrutura de diretórios).
6. **Escrita direta do cliente desabilitada por padrão** (`rtdb.escritaCliente: "nenhuma"`).
