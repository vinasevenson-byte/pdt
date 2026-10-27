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
  obterCompetenciaAtualBR,
  criarLancamentoPartidaDobrada,
  calcularSeloFechamento,
  calcularBalanceteCompetencia,
  verificarSequenciaFechamento,
  calcularPreviaFechamento,
  verificarPermissaoReabertura,
  listarCompetenciasOrdenadas
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
  executarPreviaFechamento,
  executarFecharCompetencia,
  executarReabrirCompetencia,
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

test('FASE 2 (Módulo 1) — Fechamento Mensal: biblioteca pura (bloqueios, balancete, sequência, selo SHA-256 e adulteração)', () => {
  const l1 = criarLancamentoPartidaDobrada({
    id: 'lnc_rep_r1',
    data: '10/01/2026',
    competencia: '2026-01',
    contaDebito: PLANO_CONTAS.OBRIGACOES_REPASSES_PRODUTOR,
    contaCredito: PLANO_CONTAS.BANCO_CONTA_MOVIMENTO,
    valor: 1000,
    origemModulo: 'Repasses',
    origemId: 'r1'
  });

  // 1. Balancete por conta e selo SHA-256 determinístico
  const bal = calcularBalanceteCompetencia('2026-01', { lnc_rep_r1: l1 });
  assert.equal(bal.balanceado, true);
  assert.equal(bal.totalDebitosCents, 100000);
  assert.equal(bal.totalCreditosCents, 100000);
  assert.equal(bal.contas.length, 2);

  const selo1 = calcularSeloFechamento('2026-01', { lnc_rep_r1: l1 });
  const selo2 = calcularSeloFechamento('2026-01', [l1]);
  assert.equal(selo1, selo2, 'Selo SHA-256 deve ser determinístico');
  assert.equal(selo1.length, 64);

  // 2. Bloqueio de mês em curso ou futuro (só fecha mês já encerrado)
  const prevMesEmCurso = calcularPreviaFechamento({
    competencia: '2026-10',
    lancamentos: { lnc_rep_r1: l1 },
    fechamentos: { '2026-01': { competencia: '2026-01', fechado: true } },
    competenciaAtual: '2026-10'
  });
  assert.equal(prevMesEmCurso.aptoParaFechar, false);
  assert.ok(prevMesEmCurso.bloqueios.some(b => b.codigo === 'competencia_em_curso_ou_futura'));

  // 3. Bloqueio de sequência (tentar fechar 2026-02 com 2026-01 ainda aberto)
  const seqQuebrada = verificarSequenciaFechamento('2026-02', {
    lancamentos: { lnc_rep_r1: l1 },
    fechamentos: {},
    competenciaAtual: '2026-03'
  });
  assert.equal(seqQuebrada.valido, false);
  assert.ok(seqQuebrada.bloqueios.some(b => b.codigo === 'sequencia_violada' && b.competenciaAnterior === '2026-01'));

  // 4. Bloqueios de integridade contábil:
  // 4a. Lançamento inválido + balancete desbalanceado
  const prevInvalido = calcularPreviaFechamento({
    competencia: '2026-01',
    lancamentos: {
      lnc_bad: {
        id: 'lnc_bad',
        competencia: '2026-01',
        contaDebito: '1.1.01',
        contaCredito: '1.1.01', // mesma conta!
        valor: 500,
        valorCents: 40000, // divergente de valor!
        debitoCents: 50000,
        creditoCents: 40000,
        imutavel: true
      }
    },
    competenciaAtual: '2026-02'
  });
  assert.ok(prevInvalido.bloqueios.some(b => b.codigo === 'lancamento_invalido'));
  assert.ok(prevInvalido.bloqueios.some(b => b.codigo === 'balancete_desbalanceado'));

  // 4b. Repasse Pago sem lançamento no ledger
  const prevRepSemLanc = calcularPreviaFechamento({
    competencia: '2026-01',
    lancamentos: {},
    repasses: {
      r_sem_lnc: {
        id: 'r_sem_lnc',
        status: 'Pago',
        valorSolicitado: 1000,
        valorLiquido: 1000,
        pagoEm: '15/01/2026, 14:00:00'
      }
    },
    competenciaAtual: '2026-02'
  });
  assert.ok(prevRepSemLanc.bloqueios.some(b => b.codigo === 'repasse_pago_sem_lancamento'));

  // 4c. Devolução sem contrapartida (repasse Pago -> Estornado sem lançamento de estorno)
  const prevDevSemContra = calcularPreviaFechamento({
    competencia: '2026-01',
    lancamentos: { lnc_rep_r1: l1 },
    repasses: {
      r1: {
        id: 'r1',
        status: 'Estornado',
        valorSolicitado: 1000,
        valorLiquido: 1000,
        pagoEm: '10/01/2026, 10:00:00',
        estornadoEm: '20/01/2026, 11:00:00',
        protocoloDevolucao: 'DEV-123'
      }
    },
    estornos: {
      est_r1: {
        repasseId: 'r1',
        statusAnterior: 'Pago',
        estornadoEm: '20/01/2026, 11:00:00'
      }
    },
    competenciaAtual: '2026-02'
  });
  assert.ok(prevDevSemContra.bloqueios.some(b => b.codigo === 'devolucao_sem_contrapartida'));

  // 5. Detecção de adulteração do selo SHA-256 em mês já fechado
  const lancAdulterado = { ...l1, valorCents: 99900, valor: 999 };
  const prevAdulterada = calcularPreviaFechamento({
    competencia: '2026-01',
    lancamentos: { lnc_rep_r1: lancAdulterado },
    fechamentos: {
      '2026-01': {
        competencia: '2026-01',
        fechado: true,
        status: 'Fechado',
        versao: 1,
        seloSha256: selo1
      }
    },
    competenciaAtual: '2026-02'
  });
  assert.equal(prevAdulterada.integro, false);
  assert.ok(prevAdulterada.bloqueios.some(b => b.codigo === 'adulteracao_detectada'));

  // 6. Lista de competências ordenadas preenchendo lacunas
  const comps = listarCompetenciasOrdenadas({
    lancamentos: { lnc_rep_r1: l1 },
    fechamentos: {},
    competenciaAtual: '2026-03'
  });
  assert.deepEqual(comps, ['2026-01', '2026-02', '2026-03']);
});

test('FASE 2 (Módulo 1) — Callables previaFechamento, fecharCompetencia e reabrirCompetencia (trava, sequência, segregação e versionamento)', async () => {
  const mockDb = criarMockRTDB({
    ...seedData,
    lancamentos: {
      lnc_rep_jan: criarLancamentoPartidaDobrada({
        id: 'lnc_rep_jan',
        data: '15/08/2026',
        competencia: '2026-08',
        contaDebito: PLANO_CONTAS.OBRIGACOES_REPASSES_PRODUTOR,
        contaCredito: PLANO_CONTAS.BANCO_CONTA_MOVIMENTO,
        valor: 1500,
        origemModulo: 'Repasses',
        origemId: 'rep_jan'
      }),
      lnc_rep_set: criarLancamentoPartidaDobrada({
        id: 'lnc_rep_set',
        data: '18/09/2026',
        competencia: '2026-09',
        contaDebito: PLANO_CONTAS.OBRIGACOES_REPASSES_PRODUTOR,
        contaCredito: PLANO_CONTAS.BANCO_CONTA_MOVIMENTO,
        valor: 2500,
        origemModulo: 'Repasses',
        origemId: 'rep_set'
      })
    },
    fechamentos: {}
  });

  const authFin1 = { uid: 'u_fin1', token: { role: 'financeiro', email: 'fin1@diskingressos.com.br' } };
  const authFin2 = { uid: 'u_fin2', token: { role: 'financeiro', email: 'fin2@diskingressos.com.br' } };
  const dataOutubro = new Date('2026-10-15T14:00:00-03:00'); // Competência atual: 2026-10

  // 1. Tentar fechar 2026-10 (mês em curso) deve ser bloqueado
  await assert.rejects(
    () =>
      executarFecharCompetencia(
        { auth: authFin1, data: { competencia: '2026-10' } },
        { db: mockDb, nowDate: dataOutubro }
      ),
    (err) => err.code === 'failed-precondition' && err.message.includes('em curso ou no futuro')
  );

  // 2. Tentar fechar 2026-09 antes de fechar 2026-08 deve ser bloqueado (sequência)
  await assert.rejects(
    () =>
      executarFecharCompetencia(
        { auth: authFin1, data: { competencia: '2026-09' } },
        { db: mockDb, nowDate: dataOutubro }
      ),
    (err) => err.code === 'failed-precondition' && err.message.includes('2026-08')
  );

  // 3. Fecha 2026-08 verificando que, durante a trava (onAfterLock), qualquer tentativa de criar lançamento em 2026-08 falha!
  let travaVerificada = false;
  const fechAgo = await executarFecharCompetencia(
    { auth: authFin1, data: { competencia: '2026-08', observacoes: 'Fechamento Agosto' } },
    {
      db: mockDb,
      nowDate: dataOutubro,
      onAfterLock: async () => {
        const estadoTrava = mockDb.store.fechamentos['2026-08'];
        assert.equal(estadoTrava.emFechamento, true);
        assert.equal(estadoTrava.status, 'Fechando');
        assert.throws(
          () =>
            criarLancamentoPartidaDobrada(
              {
                data: '20/08/2026',
                competencia: '2026-08',
                contaDebito: PLANO_CONTAS.OBRIGACOES_REPASSES_PRODUTOR,
                contaCredito: PLANO_CONTAS.BANCO_CONTA_MOVIMENTO,
                valor: 100
              },
              mockDb.store.fechamentos
            ),
          /encerrada em \/fechamentos/
        );
        travaVerificada = true;
      }
    }
  );
  assert.equal(travaVerificada, true);
  assert.equal(fechAgo.fechado, true);
  assert.equal(fechAgo.versao, 1);
  assert.ok(fechAgo.seloSha256 && fechAgo.seloSha256.length === 64);

  // 4. Agora 2026-09 pode ser fechado em sequência (testando também concorrência de 2 operadores)
  const [resSet1, resSet2] = await Promise.allSettled([
    executarFecharCompetencia(
      { auth: authFin1, data: { competencia: '2026-09' } },
      { db: mockDb, nowDate: dataOutubro }
    ),
    executarFecharCompetencia(
      { auth: authFin2, data: { competencia: '2026-09' } },
      { db: mockDb, nowDate: dataOutubro }
    )
  ]);
  const fechamentosOk = [resSet1, resSet2].filter(r => r.status === 'fulfilled');
  assert.equal(fechamentosOk.length, 1, 'Apenas 1 fechamento concorrente deve suceder');

  // 5. Prévia de mês fechado confere o selo SHA-256 (íntegro = true)
  const previaSet = await executarPreviaFechamento(
    { auth: authFin1, data: { competencia: '2026-09' } },
    { db: mockDb, nowDate: dataOutubro }
  );
  assert.equal(previaSet.fechado, true);
  assert.equal(previaSet.integro, true);
  assert.equal(previaSet.seloGravado, previaSet.seloCalculado);

  // 6. Reabertura: não pode reabrir 2026-08 enquanto 2026-09 (posterior) estiver fechado!
  await assert.rejects(
    () =>
      executarReabrirCompetencia(
        { auth: authFin2, data: { competencia: '2026-08', motivo: 'Ajuste retroativo em agosto' } },
        { db: mockDb, nowDate: dataOutubro }
      ),
    (err) => err.code === 'failed-precondition' && err.message.includes('última competência fechada')
  );

  // 7. Reabertura de 2026-09 pelo MESMO operador que fechou deve ser bloqueada por segregação de funções!
  const quemFechouSet = mockDb.store.fechamentos['2026-09'].fechadoPor;
  const authMesmoOperador = quemFechouSet === authFin1.token.email ? authFin1 : authFin2;
  const authOutroOperador = quemFechouSet === authFin1.token.email ? authFin2 : authFin1;

  await assert.rejects(
    () =>
      executarReabrirCompetencia(
        { auth: authMesmoOperador, data: { competencia: '2026-09', motivo: 'Tentativa pelo mesmo usuário' } },
        { db: mockDb, nowDate: dataOutubro }
      ),
    (err) => err.code === 'failed-precondition' && err.message.includes('Segregação de funções')
  );

  // 8. Reabertura de 2026-09 pelo OUTRO operador sucede e preserva histórico
  const reaberto = await executarReabrirCompetencia(
    { auth: authOutroOperador, data: { competencia: '2026-09', motivo: 'Inclusão de ajuste contábil' } },
    { db: mockDb, nowDate: dataOutubro }
  );
  assert.equal(reaberto.fechado, false);
  assert.equal(reaberto.status, 'Reaberto');
  assert.equal(reaberto.historicoReaberturas.length, 1);
  const seloV1 = reaberto.ultimoSeloSha256;

  // 9. Refechar 2026-09 gera versão 2 e guarda seloAnterior
  const refechado = await executarFecharCompetencia(
    { auth: authMesmoOperador, data: { competencia: '2026-09', observacoes: 'Refechamento v2' } },
    { db: mockDb, nowDate: dataOutubro }
  );
  assert.equal(refechado.fechado, true);
  assert.equal(refechado.versao, 2);
  assert.equal(refechado.seloAnterior, seloV1);
  assert.equal(refechado.historicoReaberturas.length, 1);

  // 10. Regras do RTDB para /fechamentos (escrita bloqueada ao cliente) e UI registrada
  const rulesRaw = JSON.parse(readFileSync(path.resolve('database.rules.json'), 'utf8')).rules;
  assert.equal(rulesRaw.fechamentos['.write'], false);
  assert.ok(rulesRaw.lancamentos['.indexOn'].includes('competencia'));
  assert.ok(rulesRaw.lancamentos.$lancamentoId['.write'].includes("child('emFechamento').val() !== true"));

  const uiFechamentoRaw = readFileSync(path.resolve('apps/financeiro/src/modules/fechamento/index.tsx'), 'utf8');
  assert.ok(uiFechamentoRaw.includes('chamarPreviaFechamento'));
  assert.ok(uiFechamentoRaw.includes('chamarFecharCompetencia'));
  assert.ok(uiFechamentoRaw.includes('chamarReabrirCompetencia'));
});

test('FASE 2 (Módulo 2) — Conciliação Bancária OFX 1.02/2.x: parser, pareamento (protocolo/data+valor/ambiguidade), bloqueio de duplicidade e vínculo manual', async () => {
  const { parsearExtratoOFX } = require('../modules/financeiro/conciliacao/domain/index.js');
  const {
    executarImportarExtratoOFX,
    executarVincularItemConciliacao
  } = require('../modules/financeiro/conciliacao/functions/index.js');

  const ofxSample = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
  <BANKMSGSRSV1>
    <STMTRS>
      <CURDEF>BRL
      <BANKACCTFROM>
        <BANKID>341
        <BRANCHID>1234
        <ACCTID>567890
      </BANKACCTFROM>
      <BANKTRANLIST>
        <DTSTART>20261001000000
        <DTEND>20261031235959
        <STMTTRN>
          <TRNTYPE>DEBIT
          <DTPOSTED>20261015120000
          <TRNAMT>-1990.00
          <FITID>FIT_001
          <CHECKNUM>TED-1990
          <MEMO>Pagamento repasse TED-1990
        </STMTTRN>
        <STMTTRN>
          <TRNTYPE>DEBIT
          <DTPOSTED>20261016120000
          <TRNAMT>-500.00
          <FITID>FIT_002
          <MEMO>Transferencia mesmo valor
        </STMTTRN>
      </BANKTRANLIST>
      <LEDGERBAL>
        <BALAMT>15000.00
      </LEDGERBAL>
    </STMTRS>
  </BANKMSGSRSV1>
</OFX>`;

  const parsed = parsearExtratoOFX(ofxSample);
  assert.equal(parsed.banco.bankId, '341');
  assert.equal(parsed.competencia, '2026-10');
  assert.equal(parsed.quantidadeTransacoes, 2);
  assert.equal(parsed.transacoes[0].valorCents, 199000);
  assert.equal(parsed.transacoes[0].protocolo, 'TED-1990');
  assert.equal(parsed.hashArquivo.length, 64);

  const mockDb = criarMockRTDB({
    ...seedData,
    lancamentos: {
      lnc_1: criarLancamentoPartidaDobrada({
        id: 'lnc_1',
        data: '15/10/2026',
        competencia: '2026-10',
        contaDebito: PLANO_CONTAS.OBRIGACOES_REPASSES_PRODUTOR,
        contaCredito: PLANO_CONTAS.BANCO_CONTA_MOVIMENTO,
        valor: 1990,
        historico: 'Liquidação bancária TED-1990'
      }),
      // Dois lançamentos de mesmo valor (R$ 500,00) na mesma janela de data sem protocolo no extrato -> deve gerar ambiguidade!
      lnc_amb_a: criarLancamentoPartidaDobrada({
        id: 'lnc_amb_a',
        data: '16/10/2026',
        competencia: '2026-10',
        contaDebito: PLANO_CONTAS.ADIANTAMENTOS_ANTECIPACOES_PRODUTOR,
        contaCredito: PLANO_CONTAS.BANCO_CONTA_MOVIMENTO,
        valor: 500,
        historico: 'Antecipação A'
      }),
      lnc_amb_b: criarLancamentoPartidaDobrada({
        id: 'lnc_amb_b',
        data: '16/10/2026',
        competencia: '2026-10',
        contaDebito: PLANO_CONTAS.ADIANTAMENTOS_ANTECIPACOES_PRODUTOR,
        contaCredito: PLANO_CONTAS.BANCO_CONTA_MOVIMENTO,
        valor: 500,
        historico: 'Antecipação B'
      })
    },
    conciliacoes: {},
    fechamentos: {}
  });

  const authFin = { uid: 'u_fin', token: { role: 'financeiro', email: 'fin@diskingressos.com.br' } };

  // 1. Importa o extrato OFX
  const conc = await executarImportarExtratoOFX(
    { auth: authFin, data: { ofxConteudo: ofxSample } },
    { db: mockDb, nowDate: new Date('2026-10-20T14:00:00-03:00') }
  );
  assert.equal(conc.status, 'ComPendencias');
  assert.equal(conc.resumo.conciliados, 1);
  assert.equal(conc.resumo.ambiguidades, 1, 'Dois candidatos com mesmo valor/data devem ir para ambiguidades');

  // 2. Tentar importar o mesmo arquivo OFX novamente deve falhar por hash SHA-256 duplicado
  await assert.rejects(
    () =>
      executarImportarExtratoOFX(
        { auth: authFin, data: { ofxConteudo: ofxSample } },
        { db: mockDb, nowDate: new Date('2026-10-20T15:00:00-03:00') }
      ),
    (err) => err.code === 'already-exists'
  );

  // 3. Vínculo manual resolve a ambiguidade de FIT_002 com lnc_amb_a
  const concVinculada = await executarVincularItemConciliacao(
    {
      auth: authFin,
      data: {
        conciliacaoId: conc.id,
        extratoId: 'FIT_002',
        lancamentoId: 'lnc_amb_a',
        justificativa: 'Comprovante conferido com Antecipação A'
      }
    },
    { db: mockDb, nowDate: new Date('2026-10-20T16:00:00-03:00') }
  );
  assert.equal(concVinculada.resumo.conciliados, 2);
  assert.equal(concVinculada.resumo.ambiguidades, 0);
});

test('FASE 2 (Módulo 3) — Remessa PIX / CNAB 240 Pagamentos e Baixa por Retorno (liquidação "00" vs rejeição "RJ")', async () => {
  const {
    executarGerarRemessaPagamento,
    executarProcessarRetornoRemessa
  } = require('../modules/financeiro/remessa/functions/index.js');

  const mockDb = criarMockRTDB(seedData);
  const dataFixa = new Date('2026-10-22T10:00:00-03:00');
  const authProd = { uid: 'u_prod', token: { role: 'produtor', produtoraId: 'prod_exemplo', email: 'prod@exemplo.com' } };
  const authFin = { uid: 'u_fin', token: { role: 'financeiro', email: 'fin@diskingressos.com.br' } };

  // Cria 2 solicitações de repasse e aprova ambas (ficam Aprovado com título cp_rep_* em status Aprovada)
  const sol1 = await executarSolicitarRepasse(
    {
      auth: authProd,
      data: {
        eventoIds: ['polaquedo', 'festival'],
        valor: 1000,
        forma: 'PIX',
        contaId: 'c1',
        aceiteBancario: true,
        aceiteTermosBordero: true
      }
    },
    { db: mockDb, nowDate: dataFixa }
  );
  const sol2 = await executarSolicitarRepasse(
    {
      auth: authProd,
      data: {
        eventoIds: ['polaquedo', 'festival'],
        valor: 500,
        forma: 'TED',
        contaId: 'c1',
        aceiteBancario: true,
        aceiteTermosBordero: true
      }
    },
    { db: mockDb, nowDate: dataFixa }
  );

  await executarDecidirRepasse(
    { auth: authFin, data: { repasseId: sol1.id, acao: 'aprovar' } },
    { db: mockDb, nowDate: dataFixa }
  );
  await executarDecidirRepasse(
    { auth: authFin, data: { repasseId: sol2.id, acao: 'aprovar' } },
    { db: mockDb, nowDate: dataFixa }
  );

  // 1. Gera remessa CNAB 240 para os dois títulos aprovados
  const remessa = await executarGerarRemessaPagamento(
    {
      auth: authFin,
      data: {
        tituloIds: [`cp_rep_${sol1.id}`, `cp_rep_${sol2.id}`],
        codigoBanco: '341'
      }
    },
    { db: mockDb, nowDate: dataFixa }
  );

  assert.equal(remessa.status, 'Gerada');
  assert.equal(remessa.quantidadeItens, 2);
  assert.equal(remessa.valorTotalCents, toCents(1000 + 490)); // PIX 1000 + TED líquido 490
  const linhasCnab = remessa.cnab240.split('\n');
  assert.equal(linhasCnab.length, 6); // Header Arq + Header Lote + 2 Seg A + Trailer Lote + Trailer Arq
  for (const linha of linhasCnab) {
    assert.equal(linha.length, 240, 'Cada linha do arquivo CNAB 240 deve ter exatamente 240 posições');
  }

  // 2. Tentar gerar outra remessa com os mesmos títulos já travados deve falhar
  await assert.rejects(
    () =>
      executarGerarRemessaPagamento(
        {
          auth: authFin,
          data: { tituloIds: [`cp_rep_${sol1.id}`] }
        },
        { db: mockDb, nowDate: dataFixa }
      ),
    (err) => err.code === 'failed-precondition' && err.message.includes('já incluído na remessa ativa')
  );

  // 3. Processa arquivo de retorno: sol1 liquidado ("00") e sol2 rejeitado pelo banco ("RJ")
  const ret = await executarProcessarRetornoRemessa(
    {
      auth: authFin,
      data: {
        remessaId: remessa.id,
        retornoEntrada: [
          {
            tituloId: `cp_rep_${sol1.id}`,
            protocoloBancario: 'CNAB-LIQ-001',
            codigoOcorrencia: '00',
            valor: 1000
          },
          {
            tituloId: `cp_rep_${sol2.id}`,
            protocoloBancario: 'CNAB-REJ-002',
            codigoOcorrencia: 'RJ',
            valor: 490
          }
        ]
      }
    },
    { db: mockDb, nowDate: dataFixa }
  );

  assert.equal(ret.liquidados.length, 1);
  assert.equal(ret.rejeitadosBanco.length, 1);

  // sol1 virou Pago e lançou no Ledger; sol2 permanece Aprovado e teve remessaId liberada para reenvio!
  assert.equal(mockDb.store.repasses[sol1.id].status, 'Pago');
  assert.ok(mockDb.store.lancamentos[`lnc_rep_${sol1.id}`]);
  assert.equal(mockDb.store.repasses[sol2.id].status, 'Aprovado');
  assert.equal(mockDb.store.contas_pagar[`cp_rep_${sol2.id}`].remessaId, undefined);
  assert.equal(mockDb.store.contas_pagar[`cp_rep_${sol2.id}`].ultimoErroRemessa, 'RJ');
});

test('FASE 2 (Módulo 4) — Apuração Fiscal e Retenções por Competência (apurarImpostosCompetencia e recolherGuiaFiscal)', async () => {
  const {
    executarApurarImpostosCompetencia,
    executarRecolherGuiaFiscal
  } = require('../modules/financeiro/fiscal/functions/index.js');

  const mockDb = criarMockRTDB(seedData);
  const authFiscal = {
    uid: 'u_fisc',
    token: { role: 'financeiro', subRole: 'fiscal', email: 'fiscal@diskingressos.com.br' }
  };
  const dataOutubro = new Date('2026-10-25T15:00:00-03:00');

  // 1. Apura impostos da competência 2026-10
  const apuracao = await executarApurarImpostosCompetencia(
    {
      auth: authFiscal,
      data: { competencia: '2026-10' }
    },
    { db: mockDb, nowDate: dataOutubro }
  );

  assert.equal(apuracao.status, 'Apurada');
  assert.ok(apuracao.baseTributavelDiskCents > 0, 'Deve apurar base tributável das taxas Disk');
  assert.ok(apuracao.tributosProprios.totalCents > 0, 'Deve calcular ISS, PIS, COFINS, IRPJ e CSLL');
  assert.ok(apuracao.retencoesTerceiros.totalProvisionadoEventosCents > 0, 'Deve consolidar retenções dos eventos (ISS, ECAD, etc.)');
  assert.equal(apuracao.seloApuracaoSha256.length, 64);
  assert.ok(mockDb.store.contas_pagar['cp_fisc_2026-10'], 'Deve provisionar título de guia fiscal em /contas_pagar');

  // 2. Recolhe a guia fiscal gerando lançamento em partida dobrada no Ledger
  const recolhimento = await executarRecolherGuiaFiscal(
    {
      auth: authFiscal,
      data: { competencia: '2026-10', protocoloGuia: 'DARF-ISS-202610' }
    },
    { db: mockDb, nowDate: dataOutubro }
  );

  assert.equal(recolhimento.status, 'Recolhida');
  assert.equal(mockDb.store.contas_pagar['cp_fisc_2026-10'].status, 'Paga');
  const lncFiscal = mockDb.store.lancamentos['lnc_fisc_2026-10'];
  assert.ok(lncFiscal, 'Recolhimento de guia fiscal deve gerar lançamento no Ledger');
  assert.equal(lncFiscal.contaDebito, PLANO_CONTAS.OBRIGACOES_RETENCOES_RECOLHER);
  assert.equal(lncFiscal.contaCredito, PLANO_CONTAS.BANCO_CONTA_MOVIMENTO);
  assert.equal(lncFiscal.valorCents, apuracao.totalGuiasARecolherCents);
});
