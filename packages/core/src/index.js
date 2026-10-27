/**
 * @diskingressos/core — Camada Transversal do ERP
 * - RBAC granular (financeiro, operador, aprovador, auditor, fiscal, comercial, produtor)
 * - Alçada de Dupla Aprovação acima de limite configurável (/config/alcada)
 * - Feature Flags e Outbox de Eventos de Domínio (/eventos_dominio)
 */

'use strict';

const ROLES_SISTEMA = Object.freeze({
  FINANCEIRO: 'financeiro',
  OPERADOR: 'operador',
  APROVADOR: 'aprovador',
  AUDITOR: 'auditor',
  FISCAL: 'fiscal',
  COMERCIAL: 'comercial',
  PRODUTOR: 'produtor'
});

const ROLES_PAINEL_INTERNO = new Set([
  ROLES_SISTEMA.FINANCEIRO,
  ROLES_SISTEMA.OPERADOR,
  ROLES_SISTEMA.APROVADOR,
  ROLES_SISTEMA.AUDITOR,
  ROLES_SISTEMA.FISCAL,
  ROLES_SISTEMA.COMERCIAL
]);

const MATRIZ_PERMISSOES = Object.freeze({
  [ROLES_SISTEMA.FINANCEIRO]: new Set(['*']),
  [ROLES_SISTEMA.APROVADOR]: new Set([
    'painel:ler',
    'repasse:aprovar',
    'repasse:recusar',
    'repasse:pagar',
    'repasse:estornar',
    'antecipacao:aprovar',
    'antecipacao:recusar',
    'antecipacao:pagar',
    'antecipacao:estornar',
    'titulo:baixar',
    'ledger:estornar',
    'competencia:previa',
    'competencia:fechar',
    'competencia:reabrir',
    'cadastro:gerenciar',
    'contratos:gerenciar',
    'negociacoes:gerenciar',
    'vendas:gerenciar',
    'conta:validar',
    'auditoria:ler'
  ]),
  [ROLES_SISTEMA.OPERADOR]: new Set([
    'painel:ler',
    'repasse:aprovar',
    'repasse:recusar',
    'repasse:pagar',
    'antecipacao:aprovar',
    'antecipacao:recusar',
    'antecipacao:pagar',
    'titulo:baixar',
    'vendas:gerenciar',
    'conta:validar'
  ]),
  [ROLES_SISTEMA.FISCAL]: new Set([
    'painel:ler',
    'fiscal:gerenciar',
    'retencoes:gerenciar',
    'competencia:previa',
    'competencia:fechar',
    'competencia:reabrir',
    'auditoria:ler'
  ]),
  [ROLES_SISTEMA.COMERCIAL]: new Set([
    'painel:ler',
    'cadastro:gerenciar',
    'contratos:gerenciar',
    'negociacoes:gerenciar',
    'vendas:gerenciar'
  ]),
  [ROLES_SISTEMA.AUDITOR]: new Set([
    'painel:ler',
    'competencia:previa',
    'auditoria:ler'
  ]),
  [ROLES_SISTEMA.PRODUTOR]: new Set([
    'portal_produtor:ler',
    'repasse:solicitar',
    'antecipacao:solicitar',
    'conta:solicitar'
  ])
});

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

/**
 * Extrai o papel efetivo de governança a partir do token de autenticação Firebase.
 * Suporta tanto `token.subRole` (quando `token.role === 'financeiro'` para compatibilidade com regras RTDB)
 * quanto `token.role` direto (`operador`, `aprovador`, `auditor`, `fiscal`, `comercial`, `produtor`).
 */
function extrairPapelEfetivo(token = {}) {
  if (!token || typeof token !== 'object') return null;
  if (token.subRole && MATRIZ_PERMISSOES[token.subRole]) {
    return token.subRole;
  }
  if (token.role && MATRIZ_PERMISSOES[token.role]) {
    return token.role;
  }
  return null;
}

function possuiAcessoPainelInterno(token = {}) {
  if (!token || typeof token !== 'object') return false;
  return ROLES_PAINEL_INTERNO.has(token.role) || ROLES_PAINEL_INTERNO.has(token.subRole);
}

/**
 * Verifica se o token possui determinada permissão granular.
 */
function temPermissao(token = {}, permissao = '') {
  const papel = extrairPapelEfetivo(token);
  if (!papel) return false;
  const conj = MATRIZ_PERMISSOES[papel];
  if (!conj) return false;
  return conj.has('*') || conj.has(permissao);
}

/**
 * Avalia a política de alçada e dupla aprovação para operações financeiras (repasses / antecipações).
 * - Quando `configAlcada.ativo === true` (ou quando `valor > configAlcada.limiteDuplaAprovacao` se definido):
 *   - 1ª aprovação grava `primeiraAprovacao` e retorna `{ requerSegundaAprovacao: true, concluido: false }`.
 *   - 2ª aprovação exige operador/aprovador com `uid` e `email` distintos do 1º aprovador!
 */
function avaliarAlcadaDuplaAprovacao({
  valor = 0,
  configAlcada = {},
  primeiraAprovacao = null,
  usuarioAtual = {},
  agora = ''
}) {
  const limiteReais = configAlcada && configAlcada.limiteDuplaAprovacao !== undefined
    ? Number(configAlcada.limiteDuplaAprovacao)
    : 50000;
  const alcaAtiva = Boolean(configAlcada && configAlcada.ativo);
  const valorCents = toCents(valor);
  const limiteCents = toCents(limiteReais);

  const exigeDupla = alcaAtiva && limiteCents > 0 && valorCents > limiteCents;
  if (!exigeDupla) {
    return {
      requerSegundaAprovacao: false,
      concluido: true,
      primeiraAprovacao: null,
      segundaAprovacao: null
    };
  }

  const uidAtual = String(usuarioAtual.uid || '');
  const emailAtual = String(usuarioAtual.email || uidAtual);

  if (!primeiraAprovacao || !primeiraAprovacao.uid) {
    return {
      requerSegundaAprovacao: true,
      concluido: false,
      novoStatus: 'AguardandoSegundaAprovacao',
      primeiraAprovacao: {
        uid: uidAtual,
        email: emailAtual,
        aprovadoEm: agora
      },
      segundaAprovacao: null
    };
  }

  // Já existe primeira aprovação: valida segregação de funções (4 olhos)
  if (
    (uidAtual && uidAtual === String(primeiraAprovacao.uid)) ||
    (emailAtual && emailAtual === String(primeiraAprovacao.email))
  ) {
    const err = new Error(
      `Alçada de dupla aprovação: o segundo aprovador (${emailAtual}) deve ser obrigatoriamente distinto do primeiro aprovador (${primeiraAprovacao.email}).`
    );
    err.code = 'failed-precondition';
    throw err;
  }

  return {
    requerSegundaAprovacao: true,
    concluido: true,
    primeiraAprovacao,
    segundaAprovacao: {
      uid: uidAtual,
      email: emailAtual,
      aprovadoEm: agora
    }
  };
}

/**
 * Cria um registro de evento de domínio (Outbox Pattern) para comunicação desacoplada entre módulos.
 */
function criarEventoDominio({
  id = null,
  tipo,
  origemModulo,
  referenciaId = '',
  produtoraId = null,
  payload = {},
  criadoEm = ''
}) {
  if (!tipo || !origemModulo) {
    throw new Error('Evento de domínio exige "tipo" e "origemModulo".');
  }
  return {
    id,
    tipo: String(tipo),
    origemModulo: String(origemModulo),
    referenciaId: String(referenciaId || ''),
    produtoraId: produtoraId || null,
    payload: payload || {},
    status: 'Pendente',
    criadoEm: criadoEm || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  };
}

async function publicarEventoDominio(customDb, dadosEvento) {
  if (!customDb || typeof customDb.ref !== 'function') return null;
  const evRef = customDb.ref('/eventos_dominio').push();
  const ev = criarEventoDominio({ ...dadosEvento, id: evRef.key });
  await evRef.set(ev);
  return ev;
}

module.exports = {
  ROLES_SISTEMA,
  ROLES_PAINEL_INTERNO,
  MATRIZ_PERMISSOES,
  extrairPapelEfetivo,
  possuiAcessoPainelInterno,
  temPermissao,
  avaliarAlcadaDuplaAprovacao,
  criarEventoDominio,
  publicarEventoDominio
};
