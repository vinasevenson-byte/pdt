# Migração segura do legado

## Portões de aceitação
- [ ] Receber `motorRepasse.js` original, seed e suíte de testes.
- [ ] Copiar arquivos originais sem mudanças semânticas.
- [ ] Validar golden tests: Polaquedo 240; Festival 4.816; consolidado 4.056 (unidades e condições conforme o teste original).
- [ ] Confirmar arredondamentos, limites, estornos, transações duplicadas e falhas de concorrência.
- [ ] Receber e comparar `database.rules.json` original com as regras novas (não sobrescrever).
- [ ] Migrar templates de `financeiro.html` e `produtor.html` com paridade funcional.
- [ ] Verificar claims reais e isolamento de escopo em Firebase Emulator.
- [ ] Rodar segurança com bundle de produção; grep é barreira adicional, não prova de isolamento.
- [ ] Nenhum ESTORNO ou repasse bancário real habilitado em Preview.
- [ ] Implantar apenas Preview após checklist e revisão de credenciais.

## Limitação desta entrega
Este pacote é uma fundação executável de UI com bloqueio por padrão, não uma migração concluída do motor ou conexão operacional.
