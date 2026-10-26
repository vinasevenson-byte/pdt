import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  validarManifestos,
  compilarArtefatosModulos,
  verificarBuildModulos
} from '../scripts/module-build.mjs';
import {
  parseArgsScaffolder,
  criarModuloVertical
} from '../scripts/module-scaffolder.mjs';

const require = createRequire(import.meta.url);

const {
  PLANO_CONTAS,
  obterDataAtualBR,
  obterCompetenciaAtualBR,
  toCents
} = require('../packages/motor-repasse/src/index.js');

const {
  validarTransicaoRepasse,
  executarSolicitarRepasse,
  executarDecidirRepasse
} = require('../services/functions/src/callables/index.js');

/**
 * Banco RTDB em memória com suporte a .transaction(), .orderByChild().equalTo(), .push(), .update(), .set() e .get()
 * para testar concorrência, rollback e efeitos colaterais das Cloud Functions sem depender de rede externa.
 */
function criarMockRTDB(initialData = {}) {
  const store = structuredClone(initialData);
  let pushCounter = 1;

  function normTokens(p) {
    return String(p || '')
      .split('/')
      .map(s => s.trim())
      .filter(Boolean);
  }

  function getAt(tokens) {
    let cur = store;
    for (const t of tokens) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[t];
    }
    return cur === undefined ? null : structuredClone(cur);
  }

  function setAt(tokens, val) {
    if (tokens.length === 0) {
      for (const k of Object.keys(store)) delete store[k];
      if (val && typeof val === 'object') Object.assign(store, structuredClone(val));
      return;
    }
    let cur = store;
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i];
      if (cur[t] == null || typeof cur[t] !== 'object') cur[t] = {};
      cur = cur[t];
    }
    const last = tokens[tokens.length - 1];
    if (val === null || val === undefined) {
      delete cur[last];
    } else {
      cur[last] = structuredClone(val);
    }
  }

  function makeSnap(val) {
    return {
      exists: () => val !== null && val !== undefined,
      val: () => structuredClone(val)
    };
  }

  function ref(refPath = '/') {
    const tokens = normTokens(refPath);
    return {
      key: tokens[tokens.length - 1] || null,
      async get() {
        return makeSnap(getAt(tokens));
      },
      async set(val) {
        setAt(tokens, val);
      },
      async update(patch) {
        for (const [k, v] of Object.entries(patch || {})) {
          const subTokens = [...tokens, ...normTokens(k)];
          setAt(subTokens, v);
        }
      },
      push(val) {
        const key = `mock_id_${pushCounter++}`;
        const childRef = ref([...tokens, key].join('/'));
        if (val !== undefined) {
          setAt([...tokens, key], val);
        }
        return childRef;
      },
      orderByChild(childField) {
        return {
          equalTo(expectedVal) {
            return {
              async get() {
                const map = getAt(tokens) || {};
                const filtered = {};
                for (const [id, item] of Object.entries(map)) {
                  if (item && item[childField] === expectedVal) {
                    filtered[id] = item;
                  }
                }
                return makeSnap(Object.keys(filtered).length > 0 ? filtered : null);
              }
            };
          }
        };
      },
      async transaction(updateFn) {
        const current = getAt(tokens);
        const next = updateFn(current);
        if (next === undefined) {
          return { committed: false, snapshot: makeSnap(current) };
        }
        setAt(tokens, next);
        return { committed: true, snapshot: makeSnap(getAt(tokens)) };
      }
    };
  }

  return { ref, store };
}

test('FASE 0 (Item 1 & 4) — Regras do RTDB: sem cascateamento na raiz/lancamentos, com .validate e arquivos sincronizados', () => {
  const rootRulesRaw = readFileSync(path.resolve('database.rules.json'), 'utf8');
  const fbRulesRaw = readFileSync(path.resolve('firebase/database.rules.json'), 'utf8');
  assert.equal(rootRulesRaw, fbRulesRaw, 'database.rules.json da raiz e firebase/database.rules.json devem ser idênticos');

  const parsed = JSON.parse(rootRulesRaw).rules;

  // 1. Raiz NÃO pode ter .read ou .write que cascateiem e anulem regras filhas
  assert.equal(parsed['.read'], undefined, 'Raiz não deve ter .read global');
  assert.equal(parsed['.write'], undefined, 'Raiz não deve ter .write global');

  // 2. Nó pai lancamentos NÃO pode ter .write (apenas $lancamentoId tem .write com !data.exists() e checagem de /fechamentos)
  assert.equal(parsed.lancamentos['.write'], undefined, 'Nó pai lancamentos não pode ter .write');
  assert.ok(parsed.lancamentos.$lancamentoId['.write'].includes('!data.exists()'));
  assert.ok(parsed.lancamentos.$lancamentoId['.write'].includes("root.child('fechamentos')"));
  assert.ok(parsed.lancamentos.$lancamentoId['.validate'].includes("newData.child('imutavel').val() === true"));

  // 3. Nó pai repasses NÃO pode ter .write e $repasseId deve ter .validate de conta Validada + máquina de estados
  assert.equal(parsed.repasses['.write'], undefined, 'Nó pai repasses não pode ter .write');
  assert.equal(parsed.repasses.$repasseId.memoriaCalculo['.write'], false);
  assert.ok(parsed.repasses.$repasseId['.validate'].includes("child('status').val() === 'Validada'"));

  // 4. Antecipações exigem que o eventoId pertença à produtoraId no próprio RTDB
  assert.ok(parsed.antecipacoes.$antId['.validate'].includes("root.child('eventos').child(newData.child('eventoId').val()).child('produtoraId').val() === newData.child('produtoraId').val()"));

  // 5. Consultas filtradas do Produtor por produtoraId com .indexOn nos nós de coleção
  for (const col of ['eventos', 'repasses', 'antecipacoes', 'despesas', 'advanced']) {
    assert.ok(parsed[col]['.read'].includes("query.orderByChild === 'produtoraId'"), `${col} deve permitir query filtrada por produtoraId`);
    assert.ok(Array.isArray(parsed[col]['.indexOn']) && parsed[col]['.indexOn'].includes('produtoraId'), `${col} deve declarar .indexOn: ['produtoraId']`);
  }

  // 6. Auditoria append-only em $auditId (!data.exists())
  assert.ok(parsed.auditoria.$auditId['.write'].includes('!data.exists()'));
  assert.ok(parsed.auditoria.$auditId['.validate'].includes('!data.exists()'));
});

test('FASE 0 (Item 2) — Máquina de estados de decidirRepasse bloqueia dupla aprovação, recusa de repasse pago/aprovado e corrida de operadores', async () => {
  // Testes puros da tabela de transição
  assert.equal(validarTransicaoRepasse('Solicitado', 'aprovar').permitido, true);
  assert.equal(validarTransicaoRepasse('Solicitado', 'recusar').permitido, true);
  assert.equal(validarTransicaoRepasse('Solicitado', 'pagar').permitido, true);
  assert.equal(validarTransicaoRepasse('Aprovado', 'pagar').permitido, true);

  // Transições proibidas
  assert.equal(validarTransicaoRepasse('Aprovado', 'aprovar').permitido, false, 'Não pode aprovar 2x');
  assert.equal(validarTransicaoRepasse('Aprovado', 'recusar').permitido, false, 'Não pode recusar após rateio aprovado');
  assert.equal(validarTransicaoRepasse('Pago', 'aprovar').permitido, false, 'Não pode aprovar repasse Pago');
  assert.equal(validarTransicaoRepasse('Pago', 'recusar').permitido, false, 'Não pode recusar repasse Pago');
  assert.equal(validarTransicaoRepasse('Pago', 'pagar').permitido, false, 'Não pode pagar 2x');
  assert.equal(validarTransicaoRepasse('Recusado', 'aprovar').permitido, false);
  assert.equal(validarTransicaoRepasse('EmProcessamento', 'aprovar').permitido, false);

  // Teste de integração com mock RTDB: fluxo completo + proteção contra dupla aprovação e concorrência
  const seed = JSON.parse(readFileSync(path.resolve('seed.json'), 'utf8'));
  const mockDb = criarMockRTDB(seed);

  const authProd = { uid: 'u_prod', token: { role: 'produtor', produtoraId: 'prod_exemplo', email: 'prod@exemplo.com' } };
  const authFin1 = { uid: 'u_fin1', token: { role: 'financeiro', email: 'fin1@disk.com' } };
  const authFin2 = { uid: 'u_fin2', token: { role: 'financeiro', email: 'fin2@disk.com' } };

  // Cria repasse de R$ 1.000,00 via TED (tarifa R$ 10,00 -> líquido R$ 990,00)
  const sol = await executarSolicitarRepasse(
    {
      auth: authProd,
      data: {
        eventoIds: ['polaquedo', 'festival'],
        valor: 1000,
        forma: 'TED',
        contaId: 'c1',
        aceiteBancario: true,
        aceiteTermosBordero: true
      }
    },
    { db: mockDb, nowDate: new Date('2026-10-31T23:30:00-03:00') }
  );

  const jaRepassadoAntes = mockDb.store.eventos.festival.jaRepassado; // 5000

  // Simula corrida: dois operadores clicam em "aprovar" ao mesmo tempo
  const resultadosCorrida = await Promise.allSettled([
    executarDecidirRepasse(
      { auth: authFin1, data: { repasseId: sol.id, acao: 'aprovar', modoRateio: 'proporcional' } },
      { db: mockDb }
    ),
    executarDecidirRepasse(
      { auth: authFin2, data: { repasseId: sol.id, acao: 'aprovar', modoRateio: 'proporcional' } },
      { db: mockDb }
    )
  ]);

  const sucessos = resultadosCorrida.filter(r => r.status === 'fulfilled');
  const falhas = resultadosCorrida.filter(r => r.status === 'rejected');
  assert.equal(sucessos.length, 1, 'Apenas 1 operador deve conseguir aprovar na corrida');
  assert.equal(falhas.length, 1, 'O segundo operador concorrente deve ser bloqueado pelo lock transacional');

  // Verifica que o rateio de R$ 1.000,00 foi somado em jaRepassado EXATAMENTE 1 vez
  const somaJaRepassadoDepois =
    mockDb.store.eventos.polaquedo.jaRepassado + mockDb.store.eventos.festival.jaRepassado;
  assert.equal(somaJaRepassadoDepois, jaRepassadoAntes + 1000);

  // Tentar aprovar de novo um repasse já Aprovado deve falhar
  await assert.rejects(
    () =>
      executarDecidirRepasse(
        { auth: authFin1, data: { repasseId: sol.id, acao: 'aprovar' } },
        { db: mockDb }
      ),
    /não pode ser aprovado novamente/
  );

  // Tentar recusar um repasse já Aprovado deve falhar
  await assert.rejects(
    () =>
      executarDecidirRepasse(
        { auth: authFin1, data: { repasseId: sol.id, acao: 'recusar', motivo: 'Tentativa inválida' } },
        { db: mockDb }
      ),
    /não é permitido recusar um repasse com status "Aprovado"/
  );
});

test('FASE 0 (Item 1 & 3) — Bloqueio de competência fechada (/fechamentos), fuso America/Sao_Paulo às 23h30 e consistência Contas a Pagar <-> Ledger', async () => {
  // 1. Verifica fuso horário: 31/10/2026 às 23:30 em São Paulo já é 01/11/2026 02:30 em UTC!
  const instanteMeiaNoiteUTC = new Date('2026-11-01T02:30:00.000Z');
  assert.equal(obterDataAtualBR(instanteMeiaNoiteUTC), '31/10/2026');
  assert.equal(obterCompetenciaAtualBR(instanteMeiaNoiteUTC), '2026-10');

  const seed = JSON.parse(readFileSync(path.resolve('seed.json'), 'utf8'));
  const mockDb = criarMockRTDB(seed);
  const authProd = { uid: 'u_prod', token: { role: 'produtor', produtoraId: 'prod_exemplo', email: 'prod@exemplo.com' } };
  const authFin = { uid: 'u_fin', token: { role: 'financeiro', email: 'fin@disk.com' } };

  const sol = await executarSolicitarRepasse(
    {
      auth: authProd,
      data: {
        eventoIds: ['polaquedo', 'festival'],
        valor: 1000,
        forma: 'TED',
        contaId: 'c1',
        aceiteBancario: true,
        aceiteTermosBordero: true
      }
    },
    { db: mockDb, nowDate: instanteMeiaNoiteUTC }
  );

  // Aprova o repasse
  await executarDecidirRepasse(
    { auth: authFin, data: { repasseId: sol.id, acao: 'aprovar' } },
    { db: mockDb, nowDate: instanteMeiaNoiteUTC }
  );

  // 2. Fecha a competência 2026-10 em /fechamentos e tenta pagar -> deve bloquear e preservar status 'Aprovado'!
  mockDb.store.fechamentos = {
    '2026-10': { competencia: '2026-10', fechado: true, status: 'Fechado' }
  };

  await assert.rejects(
    () =>
      executarDecidirRepasse(
        { auth: authFin, data: { repasseId: sol.id, acao: 'pagar', protocoloBancario: 'TED-999' } },
        { db: mockDb, nowDate: instanteMeiaNoiteUTC }
      ),
    /competência 2026-10 está encerrada em \/fechamentos/
  );
  assert.equal(mockDb.store.repasses[sol.id].status, 'Aprovado', 'Rollback do lock deve preservar status Aprovado');
  assert.equal(mockDb.store.lancamentos?.[`lnc_rep_${sol.id}`], undefined, 'Não deve criar lançamento em período fechado');

  // 3. Em competência aberta (2026-11), realiza a liquidação e verifica paridade Contas a Pagar <-> Ledger + Plano de Contas
  const diaSeguinteBR = new Date('2026-11-02T14:00:00.000Z');
  const resPago = await executarDecidirRepasse(
    { auth: authFin, data: { repasseId: sol.id, acao: 'pagar', protocoloBancario: 'TED-999' } },
    { db: mockDb, nowDate: diaSeguinteBR }
  );
  assert.equal(resPago.status, 'Pago');

  const cp = mockDb.store.contas_pagar[`cp_rep_${sol.id}`];
  const lncPrincipal = mockDb.store.lancamentos[`lnc_rep_${sol.id}`];
  const lncTarifa = mockDb.store.lancamentos[`lnc_tar_${sol.id}`];

  // Conta a Pagar e Lançamento Principal têm exatamente o mesmo valor líquido (R$ 990,00 = 99000 centavos)
  assert.equal(cp.status, 'Paga');
  assert.equal(cp.valorOriginal, 990);
  assert.equal(cp.valorPago, 990);
  assert.equal(cp.valorBaixadoCents, 99000);

  assert.equal(lncPrincipal.valor, 990);
  assert.equal(lncPrincipal.valorCents, 99000);
  assert.equal(lncPrincipal.competencia, '2026-11');
  assert.equal(lncPrincipal.data, '02/11/2026');
  assert.equal(lncPrincipal.contaDebito, PLANO_CONTAS.OBRIGACOES_REPASSES_PRODUTOR);
  assert.equal(lncPrincipal.contaCredito, PLANO_CONTAS.BANCO_CONTA_MOVIMENTO);
  assert.equal(lncPrincipal.imutavel, true);

  // Tarifa de R$ 10,00 contabilizada separadamente fechando os R$ 1.000,00 solicitados
  assert.ok(lncTarifa);
  assert.equal(lncTarifa.valor, 10);
  assert.equal(lncTarifa.valorCents, 1000);
  assert.equal(lncTarifa.contaDebito, PLANO_CONTAS.OBRIGACOES_REPASSES_PRODUTOR);
  assert.equal(lncTarifa.contaCredito, PLANO_CONTAS.RECEITA_TARIFA_TRANSFERENCIA);
  assert.equal(lncPrincipal.valorCents + lncTarifa.valorCents, toCents(sol.valorSolicitado));

  // Tentar recusar um repasse já Pago deve ser rejeitado
  await assert.rejects(
    () =>
      executarDecidirRepasse(
        { auth: authFin, data: { repasseId: sol.id, acao: 'recusar', motivo: 'Estorno indevido' } },
        { db: mockDb, nowDate: diaSeguinteBR }
      ),
    /já se encontra encerrado com status "Pago"/
  );
});

test('FASE 0 (Item 5, 6 & 7) — Unificação de functions, firebase.json blindado e motor sem divergência', () => {
  const fbJson = JSON.parse(readFileSync(path.resolve('firebase.json'), 'utf8'));
  assert.equal(fbJson.functions[0].source, 'services/functions');
  for (const requiredIgnore of ['apps/**', 'packages/**', 'services/**', 'functions/**', 'firebase/**', 'docs/**', 'legacy/**', 'backups/**']) {
    assert.ok(fbJson.hosting.ignore.includes(requiredIgnore), `firebase.json hosting.ignore deve conter ${requiredIgnore}`);
  }

  const motorRoot = readFileSync(path.resolve('motorRepasse.js'), 'utf8');
  const motorPkg = readFileSync(path.resolve('packages/motor-repasse/src/index.js'), 'utf8');
  assert.equal(motorRoot, motorPkg, 'motorRepasse.js da raiz deve estar 100% sincronizado com packages/motor-repasse/src/index.js');

  const fnLegacyExports = require('../functions/index.js');
  const fnServiceExports = require('../services/functions/src/index.js');
  assert.deepEqual(
    Object.keys(fnLegacyExports).sort(),
    Object.keys(fnServiceExports).sort(),
    'functions/index.js deve exportar exatamente os mesmos handlers de services/functions/src/index.js'
  );
});

test('FASE 0 (Seção 4) — Recuperação automática de lock transacional órfão após expiração de 5 minutos', async () => {
  const seed = JSON.parse(readFileSync(path.resolve('seed.json'), 'utf8'));
  const mockDb = criarMockRTDB(seed);
  const authProd = { uid: 'u_prod', token: { role: 'produtor', produtoraId: 'prod_exemplo', email: 'prod@exemplo.com' } };
  const authFin = { uid: 'u_fin', token: { role: 'financeiro', email: 'fin@disk.com' } };

  const t0 = new Date('2026-10-25T12:00:00-03:00');
  const sol = await executarSolicitarRepasse(
    {
      auth: authProd,
      data: {
        eventoIds: ['polaquedo', 'festival'],
        valor: 100,
        forma: 'PIX',
        contaId: 'c1',
        aceiteBancario: true,
        aceiteTermosBordero: true
      }
    },
    { db: mockDb, nowDate: t0 }
  );

  // Simula lock travado em EmProcessamento há 2 minutos (ainda ativo -> deve bloquear)
  mockDb.store.repasses[sol.id].status = 'EmProcessamento';
  mockDb.store.repasses[sol.id]._statusAnterior = 'Solicitado';
  mockDb.store.repasses[sol.id]._lockEmMs = t0.getTime();

  const t2min = new Date(t0.getTime() + 2 * 60 * 1000);
  await assert.rejects(
    () =>
      executarDecidirRepasse(
        { auth: authFin, data: { repasseId: sol.id, acao: 'aprovar' } },
        { db: mockDb, nowDate: t2min }
      ),
    /sendo processado por outro operador/
  );

  // Após 6 minutos (> 5 min), o lock expirado é recuperado automaticamente e a aprovação conclui!
  const t6min = new Date(t0.getTime() + 6 * 60 * 1000);
  const res = await executarDecidirRepasse(
    { auth: authFin, data: { repasseId: sol.id, acao: 'aprovar' } },
    { db: mockDb, nowDate: t6min }
  );
  assert.equal(res.status, 'Aprovado');
});

test('FASE 0 (Seção 5) — Scaffolder de módulos verticais (module:new, module:build, module:check) e bloqueios de segurança', () => {
  // 1. Verifica que o workspace atual passa no module:check
  const checkAtual = verificarBuildModulos(path.resolve('.'));
  assert.equal(checkAtual.ok, true, `module:check falhou: ${checkAtual.desatualizados.join(', ')}`);

  // 2. Cria workspace temporário isolado para testar module:new e validações de bloqueio
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'pdt-mod-test-'));
  try {
    mkdirSync(path.join(tempRoot, 'firebase'), { recursive: true });
    writeFileSync(
      path.join(tempRoot, 'firebase/rules.core.json'),
      readFileSync(path.resolve('firebase/rules.core.json'), 'utf8')
    );

    // Testa criação dos 3 exemplos da especificação:
    // npm run module:new -- financeiro/estornos --no estornos
    // npm run module:new -- financeiro/conciliacao --no conciliacoes --java
    // npm run module:new -- comercial/contratos --no contratos --produtor dono
    criarModuloVertical(parseArgsScaffolder(['financeiro/estornos', '--no', 'estornos']), tempRoot);
    criarModuloVertical(parseArgsScaffolder(['financeiro/conciliacao', '--no', 'conciliacoes', '--java']), tempRoot);
    criarModuloVertical(parseArgsScaffolder(['comercial/contratos', '--no', 'contratos', '--produtor', 'dono']), tempRoot);

    const checkTemp = verificarBuildModulos(tempRoot);
    assert.equal(checkTemp.ok, true);

    const rulesGeradas = JSON.parse(readFileSync(path.join(tempRoot, 'database.rules.json'), 'utf8')).rules;
    assert.ok(rulesGeradas.estornos, 'Nó /estornos deve ser gerado nas regras RTDB');
    assert.equal(rulesGeradas.estornos.$itemId['.write'], false, 'Escrita de cliente deve ser false (nenhuma) por padrão');
    assert.ok(rulesGeradas.conciliacoes, 'Nó /conciliacoes deve ser gerado');
    assert.ok(rulesGeradas.contratos['.read'].includes("query.orderByChild === 'produtoraId'"), 'Módulo com --produtor dono deve permitir leitura filtrada');

    // 3. Testa bloqueios de validação: colisão com núcleo, colisão entre módulos, ciclo de dependência, UI produtor sem leitura, termo proibido
    const coreRules = JSON.parse(readFileSync(path.resolve('firebase/rules.core.json'), 'utf8'));

    // Colisão com nó do núcleo (/eventos)
    const valColisaoNucleo = validarManifestos(
      [
        {
          pastaDominio: 'financeiro',
          pastaModulo: 'teste',
          dirAbs: tempRoot,
          manifest: { id: 'financeiro/teste', dominio: 'financeiro', modulo: 'teste', rtdb: { no: 'eventos' }, dependencias: ['core'] }
        }
      ],
      coreRules
    );
    assert.equal(valColisaoNucleo.valido, false);
    assert.ok(valColisaoNucleo.erros.some(e => e.includes('já pertence ao núcleo')));

    // Ciclo de dependências (mod_a -> mod_b -> mod_a)
    const valCiclo = validarManifestos(
      [
        {
          pastaDominio: 'financeiro',
          pastaModulo: 'mod_a',
          dirAbs: tempRoot,
          manifest: { id: 'financeiro/mod_a', dominio: 'financeiro', modulo: 'mod_a', rtdb: { no: 'mod_a' }, dependencias: ['financeiro/mod_b'] }
        },
        {
          pastaDominio: 'financeiro',
          pastaModulo: 'mod_b',
          dirAbs: tempRoot,
          manifest: { id: 'financeiro/mod_b', dominio: 'financeiro', modulo: 'mod_b', rtdb: { no: 'mod_b' }, dependencias: ['financeiro/mod_a'] }
        }
      ],
      coreRules
    );
    assert.equal(valCiclo.valido, false);
    assert.ok(valCiclo.erros.some(e => e.includes('Dependência cíclica')));

    // UI do produtor sem leitura declarada
    const valProdSemLeitura = validarManifestos(
      [
        {
          pastaDominio: 'comercial',
          pastaModulo: 'sem_leitura',
          dirAbs: tempRoot,
          manifest: {
            id: 'comercial/sem_leitura',
            dominio: 'comercial',
            modulo: 'sem_leitura',
            rtdb: { no: 'sem_leitura', leituraProdutor: 'nenhuma' },
            ui: { financeiro: true, produtor: true },
            dependencias: ['core']
          }
        }
      ],
      coreRules
    );
    assert.equal(valProdSemLeitura.valido, false);
    assert.ok(valProdSemLeitura.erros.some(e => e.includes('leituraProdutor é "nenhuma"')));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
