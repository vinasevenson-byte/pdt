# Portal do Produtor — Projeto Independente (`v2.1`)

Interface React independente do Financeiro Disk (`http://127.0.0.1:5174`), preservando o HTML original intacto em `referencia-original/Hub de Repasses – Produtor — acesso limitado.html` (`SHA-256: d423a4a13ae00048d7d96ea54fd68663a7a98ccc70b5b18c0976b40c98b1f583`).

## Como executar
```bash
npm install
npm run dev
```
Endereço local: `http://localhost:5174`

## Segurança e Conexão Real ao Firebase
- **Zero dados demonstrativos fixos:** `PROJECAO_INICIAL_PRODUTOR` foi removido.
- **Autenticação e Permissões:** Exige login real no Firebase Authentication com Custom Claims `role === 'produtor'` e `produtoraId`.
- **Isolamento de Dados:** Consome apenas os nós autorizados para a produtora autenticada (`/borderos_produtor/{produtoraId}`, `/contas/{produtoraId}` e consultas filtradas por `produtoraId`) e aciona os callables `solicitarRepasse` (com assinatura eletrônica de aceite) e `solicitarAntecipacao`.
- **Isolamento do Motor:** Não importa nem empacota o motor financeiro interno nem taxas administrativas/operacionais do Disk.
