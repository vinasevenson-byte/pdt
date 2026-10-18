import { test } from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import path from 'node:path';
const root=path.resolve('apps/produtor');
async function walk(dir){let out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='node_modules')continue;const p=path.join(dir,e.name);out.push(...(e.isDirectory()?await walk(p):[p]));}return out;}
test('produtor não depende do motor financeiro',async()=>{const p=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));assert.ok(!p.dependencies?.['@disk/motor-repasse']);});
test('produtor não contém identificadores internos proibidos em fonte nem build',async()=>{for(const f of await walk(path.join(root,'src'))){if(!/\.(tsx?|jsx?|json)$/.test(f))continue;const c=await readFile(f,'utf8');for(const k of ['taxaAdm','taxaOp','eventos_fin','@disk/motor-repasse'])assert.equal(c.includes(k),false,`${k} em ${f}`);}
 const dist=path.join(root,'dist');let files=[];try{files=await walk(dist);}catch{return;}
 for(const f of files){if(!/\.(js|html|css)$/.test(f))continue;const c=await readFile(f,'utf8');for(const k of ['taxaAdm','taxaOp','eventos_fin','@disk/motor-repasse'])assert.equal(c.includes(k),false,`${k} no build`);}
});
