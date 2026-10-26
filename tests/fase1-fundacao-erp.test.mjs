import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  ROLES_SISTEMA,
  temPermissao,
  avaliarAlcadaDuplaAprovacao,
  criarEventoDominio
} = require('../packages/core/src/index.js');

const {
  toCents,
  fromCents,
  addMoney,
  subMoney,
  mulPct,
  calcEvento,
  calcConsolidado,
  derivarJaRepassadoPorEvento,
  PLANO_CONTAS,
  obterCompetenciaAtualBR
} = require('../packages/motor-repasse/src/index.js');

const {
  validarTransicaoRepasse,
  validarTransicaoAntecipacao,
  executarSolicitarRepasse,
  executarDecidirRepasse,
  executarEstornarRepasse,
  executarSolicitarAntecipacao,
  executarDecidirAntecipacao
} = require('../services/functions/src/callables/index.js');

const {
  executarFecharCompetencia,
  executarEstornarLancamento
} = require('../services/functions/src/modules/financeiro_core/index.js');

const seedData = JSON.parse(readFileSync(path.resolve('firebase/seed.json'), 'utf8'));

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
        const key = `f1_id_${pushCounter++}`;
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

test('FASE 1 (Item 1) — RBAC Granular (@diskingressos/core): matriz de permissões e bloqueio de mutações para auditor/operador sem alçada', async () => {
  const tokenAuditor = { role: 'financeiro', subRole: ROLES_SISTEMA.AUDITOR, email: 'auditor@diskingressos.com.br' };
  const tokenOperador = { role: 'financeiro', subRole: ROLES_SISTEMA.OPERADOR, email: 'operador@diskingressos.com.br' };
  const tokenAprovador = { role: 'financeiro', subRole: ROLES_SISTEMA.APROVADOR, email: 'aprovador@diskingressos.com.br' };
  const tokenFiscal = { role: 'financeiro', subRole: ROLES_SISTEMA.FISCAL, email: 'fiscal@diskingressos.com.br' };

  assert.equal(temPermissao(tokenAuditor, 'auditoria:ler'), true);
  assert.equal(temPermissao(tokenAuditor, 'repasse:aprovar'), false);
  assert.equal(temPermissao(tokenOperador, 'repasse:aprovar'), true);
  assert.equal(temPermissao(tokenOperador, 'repasse:estornar'), false);
  assert.equal(temPermissao(tokenOperador, 'competencia:fechar'), false);
  assert.equal(temPermissao(tokenAprovador, 'repasse:estornar'), true);
  assert.equal(temPermissao(tokenFiscal, 'competencia:fechar'), true);

  const mockDb = criarMockRTDB(seedData);

  // Auditor não pode aprovar repasse nem fechar competência
  await assert.rejects(
    () =>
      executarDecidirRepasse(
        {
          auth: { uid: 'u_aud', token: tokenAuditor },
          data: { repasseId: 'rep_1', acao: 'aprovar' }
        },
        { db: mockDb }
      ),
    (err) => err.code === 'permission-denied'
  );

  await assert.rejects(
    () =>
      executarFecharCompetencia(
        {
          auth: { uid: 'u_aud', token: tokenAuditor },
          data: { competencia: '2026-10' }
        },
        { db: mockDb }
      ),
    (err) => err.code === 'permission-denied'
  );

  // Operador não pode estornar repasse (exige aprovador ou financeiro master)
  await assert.rejects(
    () =>
      executarEstornarRepasse(
        {
          auth: { uid: 'u_op', token: tokenOperador },
          data: { repasseId: 'rep_1', motivo: 'Tentativa de estorno por operador' }
        },
        { db: mockDb }
      ),
    (err) => err.code === 'permission-denied'
  );
});

test('FASE 1 (Item 2) — Alçada de Dupla Aprovação (4 olhos) acima do limite configurado em /config/alcada', async () => {
  const mockDb = criarMockRTDB(seedData);
  // Ativa alçada de dupla aprovação acima de R$ 2.000,00
  await mockDb.ref('/config/alcada').set({
    ativo: true,
    limiteDuplaAprovacao: 2000
  });

  // Produtor solicita repasse de R$ 3.000,00 (acima do limite de R$ 2.000,00)
  const sol = await executarSolicitarRepasse(
    {
      auth: { uid: 'u_prod', token: { role: 'produtor', produtoraId: 'prod_exemplo', email: 'prod@exemplo.com' } },
      data: {
        eventoIds: ['polaquedo', 'festival'],
        valor: 3000,
        forma: 'PIX',
        contaId: 'c1',
        aceiteBancario: true,
        aceiteTermosBordero: true
      }
    },
    { db: mockDb }
  );

  // 1ª Aprovação pelo Operador 1 -> status vai para AguardandoSegundaAprovacao e NÃO altera jaRepassado ainda
  const res1 = await executarDecidirRepasse(
    {
      auth: {
        uid: 'uid_op_1',
        token: { role: 'financeiro', subRole: 'operador', email: 'operador1@diskingressos.com.br' }
      },
      data: { repasseId: sol.id, acao: 'aprovar', modoRateio: 'proporcional' }
    },
    { db: mockDb }
  );

  assert.equal(res1.status, 'AguardandoSegundaAprovacao');
  assert.equal(res1.requerSegundaAprovacao, true);
  assert.equal(mockDb.store.eventos.polaquedo.jaRepassado, 0, 'jaRepassado não deve mudar na 1ª aprovação');
  assert.equal(mockDb.store.eventos.festival.jaRepassado, 5000, 'jaRepassado não deve mudar na 1ª aprovação');

  // Tentativa de 2ª aprovação pelo MESMO operador 1 -> bloqueada pela regra de 4 olhos!
  await assert.rejects(
    () =>
      executarDecidirRepasse(
        {
          auth: {
            uid: 'uid_op_1',
            token: { role: 'financeiro', subRole: 'operador', email: 'operador1@diskingressos.com.br' }
          },
          data: { repasseId: sol.id, acao: 'aprovar', modoRateio: 'proporcional' }
        },
        { db: mockDb }
      ),
    (err) => err.code === 'failed-precondition' && err.message.includes('distinto do primeiro aprovador')
  );

  // 2ª Aprovação por um segundo aprovador distinto -> conclui aprovação e aplica rateio!
  const res2 = await executarDecidirRepasse(
    {
      auth: {
        uid: 'uid_aprov_2',
        token: { role: 'financeiro', subRole: 'aprovador', email: 'aprovador2@diskingressos.com.br' }
      },
      data: { repasseId: sol.id, acao: 'aprovar', modoRateio: 'proporcional' }
    },
    { db: mockDb }
  );

  assert.equal(res2.status, 'Aprovado');
  assert.equal(res2.memoriaCalculo.duplaAprovacao.primeiraAprovacao.email, 'operador1@diskingressos.com.br');
  assert.equal(res2.memoriaCalculo.duplaAprovacao.segundaAprovacao.email, 'aprovador2@diskingressos.com.br');
});

test('FASE 1 (Item 3) — Fluxo de Estorno de Repasse Aprovado e Pago (reversão de rateio, abatimentos, CP e Ledger)', async () => {
  const mockDb = criarMockRTDB(seedData);
  const dataFixa = new Date('2026-10-20T15:00:00-03:00');
  const compFixa = obterCompetenciaAtualBR(dataFixa);

  const sol = await executarSolicitarRepasse(
    {
      auth: { uid: 'u_prod', token: { role: 'produtor', produtoraId: 'prod_exemplo', email: 'prod@exemplo.com' } },
      data: {
        eventoIds: ['polaquedo', 'festival'],
        valor: 2000,
        forma: 'TED',
        contaId: 'c1',
        aceiteBancario: true,
        aceiteTermosBordero: true
      }
    },
    { db: mockDb, nowDate: dataFixa }
  );

  // Aprova e Paga o repasse (gera lnc_rep_* e lnc_tar_*, soma jaRepassado e consome abaterNoProximo)
  await executarDecidirRepasse(
    {
      auth: { uid: 'u_fin', token: { role: 'financeiro', email: 'fin@diskingressos.com.br' } },
      data: { repasseId: sol.id, acao: 'pagar', protocoloBancario: 'TED-999' }
    },
    { db: mockDb, nowDate: dataFixa }
  );

  assert.equal(mockDb.store.repasses[sol.id].status, 'Pago');
  assert.ok(mockDb.store.lancamentos[`lnc_rep_${sol.id}`], 'Lançamento principal deve existir');
  assert.ok(mockDb.store.lancamentos[`lnc_tar_${sol.id}`], 'Lançamento de tarifa TED deve existir');
  assert.equal(mockDb.store.advanced.adv_1.abaterNoProximo, false, 'Adiantamento foi abatido no repasse');
  assert.equal(mockDb.store.antecipacoes.ant_1.abaterNoProximo, false, 'Antecipação foi abatida no repasse');

  // 1. Segregação de funções (ESTORNO_SEGREGACAO): o mesmo operador que liquidou NÃO pode estornar
  await assert.rejects(
    () =>
      executarEstornarRepasse(
        {
          auth: { uid: 'u_fin', token: { role: 'financeiro', email: 'fin@diskingressos.com.br' } },
          data: { repasseId: sol.id, motivo: 'Tentativa pelo próprio liquidador', protocoloDevolucao: 'DEV-001' }
        },
        { db: mockDb, nowDate: dataFixa }
      ),
    (err) => err.code === 'failed-precondition' && err.message.includes('Segregação de funções')
  );

  // 2. Exigência de protocoloDevolucao para repasse Pago
  await assert.rejects(
    () =>
      executarEstornarRepasse(
        {
          auth: { uid: 'u_aprov2', token: { role: 'financeiro', subRole: 'aprovador', email: 'aprovador2@diskingressos.com.br' } },
          data: { repasseId: sol.id, motivo: 'Estorno sem protocolo de devolução' }
        },
        { db: mockDb, nowDate: dataFixa }
      ),
    (err) => err.code === 'invalid-argument' && err.message.includes('protocoloDevolucao')
  );

  // 3. Se a competência estiver fechada, o estorno de repasse Pago deve ser bloqueado
  await mockDb.ref(`/fechamentos/${compFixa}`).set({ competencia: compFixa, fechado: true, status: 'Fechado' });
  await assert.rejects(
    () =>
      executarEstornarRepasse(
        {
          auth: { uid: 'u_aprov2', token: { role: 'financeiro', subRole: 'aprovador', email: 'aprovador2@diskingressos.com.br' } },
          data: { repasseId: sol.id, motivo: 'Erro operacional bancário', protocoloDevolucao: 'DEV-002' }
        },
        { db: mockDb, nowDate: dataFixa }
      ),
    (err) => err.code === 'failed-precondition' && err.message.includes('encerrada')
  );

  // Reabre no mock para testar o estorno completo por um segundo operador distinto
  await mockDb.ref(`/fechamentos/${compFixa}`).set(null);

  const estRes = await executarEstornarRepasse(
    {
      auth: { uid: 'u_aprov2', token: { role: 'financeiro', subRole: 'aprovador', email: 'aprovador2@diskingressos.com.br' } },
      data: { repasseId: sol.id, motivo: 'Devolução TED bancária — conta divergente', protocoloDevolucao: 'DEV-TED-999' }
    },
    { db: mockDb, nowDate: dataFixa }
  );

  assert.equal(estRes.status, 'Estornado');
  assert.equal(estRes.statusAnterior, 'Pago');
  assert.equal(estRes.restauracaoAbatimentos, 'automatica');
  assert.equal(mockDb.store.repasses[sol.id].status, 'Estornado');
  assert.equal(mockDb.store.repasses[sol.id].motivoEstorno, undefined, 'Não deve expor motivo interno em /repasses (visível ao produtor)');
  assert.equal(mockDb.store.estornos[`est_${sol.id}`].motivo, 'Devolução TED bancária — conta divergente');
  assert.equal(mockDb.store.estornos[`est_${sol.id}`].protocoloDevolucao, 'DEV-TED-999');
  assert.equal(mockDb.store.contas_pagar[`cp_rep_${sol.id}`].status, 'Cancelada');

  // Verifica reversão exata do jaRepassado para os valores originais do seed (0 e 5000)
  assert.equal(mockDb.store.eventos.polaquedo.jaRepassado, 0);
  assert.equal(mockDb.store.eventos.festival.jaRepassado, 5000);

  // Verifica restauração automática dos abatimentos registrados na aprovação
  assert.equal(mockDb.store.advanced.adv_1.abaterNoProximo, true);
  assert.equal(mockDb.store.antecipacoes.ant_1.abaterNoProximo, true);

  // 4. Repasse legado (rep_hist_1 do seed, sem abatimentosAplicados) devolve restauracaoAbatimentos: 'manual' e alerta na auditoria
  const estLegado = await executarEstornarRepasse(
    {
      auth: { uid: 'u_aprov2', token: { role: 'financeiro', subRole: 'aprovador', email: 'aprovador2@diskingressos.com.br' } },
      data: { repasseId: 'rep_hist_1', motivo: 'Estorno de repasse histórico legado', protocoloDevolucao: 'DEV-HIST-1' }
    },
    { db: mockDb, nowDate: dataFixa }
  );
  assert.equal(estLegado.restauracaoAbatimentos, 'manual');
  assert.equal(mockDb.store.eventos.festival.jaRepassado, 0, 'Deve reverter os 5000 de rep_hist_1 em festival');

  // Verifica geração dos lançamentos inversos no Ledger (partida dobrada invertida)
  const estRep = mockDb.store.lancamentos[`lnc_est_rep_${sol.id}`];
  const estTar = mockDb.store.lancamentos[`lnc_est_tar_${sol.id}`];
  assert.ok(estRep, 'Deve gerar lançamento de estorno para o líquido');
  assert.ok(estTar, 'Deve gerar lançamento de estorno para a tarifa');
  assert.equal(estRep.contaDebito, PLANO_CONTAS.BANCO_CONTA_MOVIMENTO);
  assert.equal(estRep.contaCredito, PLANO_CONTAS.OBRIGACOES_REPASSES_PRODUTOR);
  assert.equal(estRep.valorCents, toCents(1990));
  assert.equal(estTar.valorCents, toCents(10));

  // Verifica evento de domínio publicado no Outbox (/eventos_dominio)
  const evDomList = Object.values(mockDb.store.eventos_dominio || {});
  assert.ok(evDomList.some(e => e.tipo === 'REPASSE_ESTORNADO' && e.referenciaId === sol.id));
});

test('FASE 1 (Item 4) — Callable decidirAntecipacao com máquina de estados, validação de teto retido e lançamento no Ledger', async () => {
  assert.equal(validarTransicaoAntecipacao('Solicitada', 'aprovar').permitido, true);
  assert.equal(validarTransicaoAntecipacao('Solicitada', 'recusar').permitido, true);
  assert.equal(validarTransicaoAntecipacao('Solicitada', 'pagar').permitido, true);
  assert.equal(validarTransicaoAntecipacao('Aprovada', 'pagar').permitido, true);
  assert.equal(validarTransicaoAntecipacao('Aprovada', 'aprovar').permitido, false);
  assert.equal(validarTransicaoAntecipacao('Aprovada', 'recusar').permitido, false);
  assert.equal(validarTransicaoAntecipacao('Paga', 'recusar').permitido, false);

  const mockDb = criarMockRTDB(seedData);
  const dataFixa = new Date('2026-10-21T11:00:00-03:00');

  // Produtor solicita antecipação válida de R$ 500,00 no evento festival
  const ant = await executarSolicitarAntecipacao(
    {
      auth: { uid: 'u_prod', token: { role: 'produtor', produtoraId: 'prod_exemplo', email: 'prod@exemplo.com' } },
      data: { eventoId: 'festival', valor: 500 }
    },
    { db: mockDb, nowDate: dataFixa }
  );
  assert.equal(ant.status, 'Solicitada');

  // 1º passo: Operador aprova a antecipação (Solicitada -> Aprovada)
  const dec1 = await executarDecidirAntecipacao(
    {
      auth: { uid: 'u_op', token: { role: 'financeiro', subRole: 'operador', email: 'op@diskingressos.com.br' } },
      data: { antId: ant.id, acao: 'aprovar' }
    },
    { db: mockDb, nowDate: dataFixa }
  );
  assert.equal(dec1.status, 'Aprovada');

  // Tentativa de aprovar de novo ou recusar após Aprovada deve falhar
  await assert.rejects(
    () =>
      executarDecidirAntecipacao(
        {
          auth: { uid: 'u_op', token: { role: 'financeiro', subRole: 'operador', email: 'op@diskingressos.com.br' } },
          data: { antId: ant.id, acao: 'recusar' }
        },
        { db: mockDb, nowDate: dataFixa }
      ),
    (err) => err.code === 'failed-precondition'
  );

  // 2º passo: Liquidar antecipação (Aprovada -> Paga) -> gera lançamento contábil em /lancamentos/lnc_ant_{id}
  const dec2 = await executarDecidirAntecipacao(
    {
      auth: { uid: 'u_op', token: { role: 'financeiro', subRole: 'operador', email: 'op@diskingressos.com.br' } },
      data: { antId: ant.id, acao: 'pagar', protocoloBancario: 'PIX-ANT-500' }
    },
    { db: mockDb, nowDate: dataFixa }
  );
  assert.equal(dec2.status, 'Paga');

  const lancAnt = mockDb.store.lancamentos[`lnc_ant_${ant.id}`];
  assert.ok(lancAnt, 'Pagamento de antecipação deve gerar lançamento no Ledger');
  assert.equal(lancAnt.valorCents, toCents(500));
  assert.equal(lancAnt.contaDebito, PLANO_CONTAS.ADIANTAMENTOS_ANTECIPACOES_PRODUTOR);
  assert.equal(lancAnt.contaCredito, PLANO_CONTAS.BANCO_CONTA_MOVIMENTO);
  assert.equal(mockDb.store.contas_pagar[`cp_ant_${ant.id}`].status, 'Paga');

  // 3º passo: Estorno da antecipação Paga exige outro aprovador (ESTORNO_SEGREGACAO) e protocoloDevolucao
  await assert.rejects(
    () =>
      executarDecidirAntecipacao(
        {
          auth: { uid: 'u_op', token: { role: 'financeiro', subRole: 'aprovador', email: 'op@diskingressos.com.br' } },
          data: { antId: ant.id, acao: 'estornar', motivo: 'Tentativa pelo mesmo operador', protocoloDevolucao: 'DEV-ANT-1' }
        },
        { db: mockDb, nowDate: dataFixa }
      ),
    (err) => err.code === 'failed-precondition' && err.message.includes('Segregação de funções')
  );

  const estAnt = await executarDecidirAntecipacao(
    {
      auth: { uid: 'u_aprov2', token: { role: 'financeiro', subRole: 'aprovador', email: 'aprovador2@diskingressos.com.br' } },
      data: { antId: ant.id, acao: 'estornar', motivo: 'Devolução bancária da antecipação', protocoloDevolucao: 'DEV-ANT-500' }
    },
    { db: mockDb, nowDate: dataFixa }
  );
  assert.equal(estAnt.status, 'Estornada');
  assert.equal(mockDb.store.antecipacoes[ant.id].status, 'Estornada');
  assert.equal(mockDb.store.antecipacoes[ant.id].abaterNoProximo, false);
  assert.equal(mockDb.store.contas_pagar[`cp_ant_${ant.id}`].status, 'Cancelada');
  assert.ok(mockDb.store.lancamentos[`lnc_est_ant_${ant.id}`], 'Deve gerar lançamento inverso de estorno para a antecipação paga');
  assert.equal(mockDb.store.estornos[`est_ant_${ant.id}`].protocoloDevolucao, 'DEV-ANT-500');
});

test('FASE 1 (Item 5) — Aritmética Unificada em Centavos, Derivação de jaRepassado sem Corrida e Extrato do Produtor', () => {
  // Casos clássicos de erro IEEE-754 em ponto flutuante
  assert.equal(addMoney(0.1, 0.2), 0.3);
  assert.equal(subMoney(1.0, 0.9), 0.1);
  assert.equal(mulPct(19.99, 10), 2.0);
  assert.equal(toCents(addMoney(10.01, 20.02, 30.03)), 6006);

  // Derivação determinística de jaRepassado a partir dos repasses ativos (Aprovado / Pago), ignorando Estornado / Recusado
  const repassesSimulados = [
    { status: 'Pago', memoriaCalculo: { rateioAplicado: { festival: 5000, polaquedo: 100.25 } } },
    { status: 'Aprovado', memoriaCalculo: { rateioAplicado: { festival: 1200.5, polaquedo: 39.75 } } },
    { status: 'Estornado', memoriaCalculo: { rateioAplicado: { festival: 3000, polaquedo: 200 } } },
    { status: 'Recusado', memoriaCalculo: { rateioAplicado: { festival: 999 } } }
  ];
  assert.equal(derivarJaRepassadoPorEvento('festival', repassesSimulados, 0), 6200.5);
  assert.equal(derivarJaRepassadoPorEvento('polaquedo', repassesSimulados, 0), 140.0);

  // Verifica que o módulo de Extrato do Produtor e o App do Produtor conectam VERTICAL_PRODUTOR_MODULES
  const appProdutorRaw = readFileSync(path.resolve('apps/produtor/src/app/App.tsx'), 'utf8');
  const extratoProdutorRaw = readFileSync(path.resolve('apps/produtor/src/modules/extrato/index.tsx'), 'utf8');
  assert.ok(appProdutorRaw.includes('VERTICAL_PRODUTOR_MODULES'), 'App do Produtor deve conectar VERTICAL_PRODUTOR_MODULES');
  assert.ok(appProdutorRaw.includes('ExtratoProdutorModule'), 'App do Produtor deve renderizar ExtratoProdutorModule');
  assert.ok(extratoProdutorRaw.includes('Histórico de Movimentações de Repasse'), 'ExtratoProdutorModule deve exibir tabela completa');
});

test('FASE 2 — Módulos Verticais de Negócio (chargebacks, conciliacao, contratos) e Modal de Decisão sem window.prompt', () => {
  const { calcularImpactoChargebacksEvento } = require('../modules/financeiro/chargebacks/domain/index.js');
  const { conciliarExtratoBancario } = require('../modules/financeiro/conciliacao/domain/index.js');
  const { validarVigenciaContrato } = require('../modules/comercial/contratos/domain/index.js');

  // 1. Chargebacks frente à reserva de reembolso
  const impactoCb = calcularImpactoChargebacksEvento({
    reservaReembolso: 500,
    chargebacks: [
      { status: 'Confirmado', valor: 350.4 },
      { status: 'EmDisputa', valor: 249.6 },
      { status: 'Revertido', valor: 100 }
    ]
  });
  assert.equal(impactoCb.exposicaoTotal, 600);
  assert.equal(impactoCb.cobertoPelaReserva, 500);
  assert.equal(impactoCb.excedenteDescoberto, 100);

  // 2. Conciliação Bancária em centavos contra lançamentos do Ledger
  const resConc = conciliarExtratoBancario({
    itensExtrato: [
      { id: 'ext_1', protocolo: 'TED-100', valor: 4990 },
      { id: 'ext_2', protocolo: 'PIX-200', valor: 1500 },
      { id: 'ext_3', protocolo: 'TED-SEM-LEDGER', valor: 300 }
    ],
    lancamentosLedger: [
      { id: 'lnc_1', historico: 'Liquidação TED-100', valorCents: 499000 },
      { id: 'lnc_2', historico: 'Liquidação PIX-200', valorCents: 149000 }
    ]
  });
  assert.equal(resConc.conciliados.length, 1);
  assert.equal(resConc.divergentesValor.length, 1);
  assert.equal(resConc.divergentesValor[0].diferenca, 10);
  assert.equal(resConc.pendentesExtrato.length, 1);
  assert.equal(resConc.conciliadoComSucesso, false);

  // 3. Vigência de Contratos Comerciais
  const vig = validarVigenciaContrato(
    {
      id: 'ctr_1',
      produtoraId: 'prod_exemplo',
      assinadoProdutor: true,
      assinadoComercial: true,
      vigenciaInicio: '2026-01-01',
      vigenciaFim: '2026-12-31',
      status: 'Assinado'
    },
    '2026-10-26'
  );
  assert.equal(vig.vigente, true);
  assert.equal(vig.statusCalculado, 'Vigente');

  // 4. UI do Financeiro utiliza ModalDecisaoFinanceira em vez de window.prompt
  const repassesUiRaw = readFileSync(path.resolve('apps/financeiro/src/modules/repasses/index.tsx'), 'utf8');
  assert.equal(repassesUiRaw.includes('window.prompt'), false, 'UI de Repasses não deve usar window.prompt');
  assert.ok(repassesUiRaw.includes('renderizarPainelDecisaoInline'), 'UI de Repasses deve usar modal inline dedicado');
});
