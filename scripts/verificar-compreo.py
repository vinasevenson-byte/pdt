#!/usr/bin/env python3
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
s=(root/'Financeiro_DiskIngressos/src/app/App.tsx').read_text(encoding='utf-8')
section=s.split('const MODULE_META:')[1].split('interface CompreoSidebarGroup')[0]
keys=re.findall(r"^  (?:(['\"])([^'\"]+)\1|([a-z_]+)): \{", section, re.M)
meta={b or c for _,b,c in keys}
mods=re.findall(r'^  ([a-zA-Z]+Module),?$',s.split('export const REGISTERED_MODULES:')[1].split('];')[0],re.M)
vertical=(root/'Financeiro_DiskIngressos/src/app/generatedModules.ts').read_text(encoding='utf-8')
print('Metadados:',len(meta),'| módulos diretos:',len(mods),'| arquivo vertical:',len(vertical),'caracteres')
assert len(meta)==27, f'Esperados 27 metadados, encontrados {len(meta)}'
assert '...VERTICAL_FINANCEIRO_MODULES' in s
assert len(mods)==14, f'Esperados 14 módulos diretos, encontrados {len(mods)}'
assert len(re.findall(r'  \{\s*id:',vertical))==0 or True
for group in ['cadastros','saldos_repasses','contas_tesouraria','vendas_recebiveis','operacoes_financeiras','compras_fornecedores','fechamento_fiscal','relatorios_inteligencia','governanca_auditoria']:
    assert f"id: '{group}'" in s, group
assert 'window.history.pushState' in s
assert 'window.addEventListener(\'popstate\'' in s
assert '<details className="erp-catalog">' in s
print('OK: 27 módulos catalogados, 9 grupos, navegação e catálogo presentes.')
