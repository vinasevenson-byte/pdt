/**
 * Cloud Function Handler — Módulo Usuários, Papéis (RBAC) e Alçadas (admin/usuarios)
 * - `atribuirPapelUsuarioERP`: valida papel/claims, bloqueia auto-elevação, aplica Custom Claims no Firebase Auth
 *   e grava histórico versionado em `/usuarios_erp/{uid}`.
 * - `configurarAlcadaERP`: atualiza `/config/alcada` com validação e trilha de auditoria.
 */
'use strict';

const {
  admin,
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  registrarAuditoria,
  temPermissao,
  publicarEventoDominio
} = require('../../../../services/functions/src/shared/recalculo');
const { validarUsuarios } = require('../contract');
const {
  validarAtribuicaoPapelERP,
  validarConfiguracaoAlcada
} = require('../domain');
const { onCall, HttpsError } = httpsV2;

async function executarAtribuirPapelUsuarioERP(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'usuarios:gerenciar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas administradores com permissão "usuarios:gerenciar" podem atribuir ou alterar papéis no ERP.'
    );
  }

  const dados = request.data || {};
  const uidAlvo = String(dados.uid || '').trim();

  const [prodSnap, usrSnap] = await Promise.all([
    db.ref('/produtoras').get(),
    uidAlvo ? db.ref(`/usuarios_erp/${uidAlvo}`).get() : Promise.resolve({ exists: () => false, val: () => null })
  ]);

  const produtoras = prodSnap.val() || {};
  const usuarioExistente = usrSnap && usrSnap.exists() ? usrSnap.val() : null;

  let validado;
  try {
    validado = validarAtribuicaoPapelERP(dados, {
      executorUid: auth.uid,
      produtoras,
      usuarioExistente
    });
  } catch (err) {
    const ehSegregacao = err.message.includes('Segregação') || err.message.includes('inativa') || err.message.includes('não encontrada');
    throw new HttpsError(ehSegregacao ? 'failed-precondition' : 'invalid-argument', err.message);
  }

  // Aplica Custom Claims no Firebase Auth quando disponível ou injetado em deps.authAdmin
  const authAdmin = deps.authAdmin !== undefined ? deps.authAdmin : (admin && typeof admin.auth === 'function' ? admin.auth() : null);
  let claimsAplicadasAuth = false;
  if (authAdmin && typeof authAdmin.setCustomUserClaims === 'function') {
    try {
      await authAdmin.setCustomUserClaims(validado.uid, validado.customClaims);
      claimsAplicadasAuth = true;
    } catch (e) {
      // Se for mock ou usuário ainda não provisionado no Auth Emulator, registra no nó /usuarios_erp
      if (deps.authAdmin) throw e;
    }
  }

  const executor = auth.token.email || auth.uid;
  const dataHora = formatarDataHoraBR(nowDate);
  const historicoAnterior = (usuarioExistente && usuarioExistente.historico) || {};

  const registroUsuario = {
    uid: validado.uid,
    email: validado.email,
    nome: validado.nome,
    papel: validado.papel,
    produtoraId: validado.produtoraId,
    ativo: validado.ativo,
    status: validado.status,
    versao: validado.versao,
    customClaims: validado.customClaims,
    claimsAplicadasAuth,
    ultimoMotivo: validado.motivo,
    atualizadoPor: executor,
    atualizadoEm: dataHora,
    historico: {
      ...historicoAnterior,
      [`v${validado.versao}`]: {
        versao: validado.versao,
        papel: validado.papel,
        produtoraId: validado.produtoraId,
        status: validado.status,
        customClaims: validado.customClaims,
        motivo: validado.motivo,
        alteradoPor: executor,
        alteradoEm: dataHora
      }
    }
  };

  await db.ref(`/usuarios_erp/${validado.uid}`).set(registroUsuario);

  await registrarAuditoria(
    {
      usuario: executor,
      modulo: 'admin/usuarios',
      eventoId: validado.produtoraId || '',
      acao: `Atribuição de Papel RBAC (${validado.papel})`,
      resumo: `Usuário ${validado.email} (${validado.uid}) atribuído ao papel "${validado.papel}" (status: ${validado.status}, v${validado.versao}). Motivo: ${validado.motivo}`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: 'PapelUsuarioAtribuido',
    origemModulo: 'admin/usuarios',
    referenciaId: validado.uid,
    produtoraId: validado.produtoraId || '',
    payload: {
      uid: validado.uid,
      email: validado.email,
      papel: validado.papel,
      status: validado.status,
      versao: validado.versao
    }
  });

  return registroUsuario;
}

async function executarConfigurarAlcadaERP(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'usuarios:gerenciar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas administradores com permissão "usuarios:gerenciar" podem alterar a alçada de dupla aprovação.'
    );
  }

  let validado;
  try {
    validado = validarConfiguracaoAlcada(request.data || {});
  } catch (err) {
    throw new HttpsError('invalid-argument', err.message);
  }

  const executor = auth.token.email || auth.uid;
  const dataHora = formatarDataHoraBR(nowDate);

  const registroAlcada = {
    ativo: validado.ativo,
    limiteDuplaAprovacaoReais: validado.limiteDuplaAprovacaoReais,
    limiteDuplaAprovacaoCents: validado.limiteDuplaAprovacaoCents,
    motivoUltimaAlteracao: validado.motivo,
    atualizadoPor: executor,
    atualizadoEm: dataHora
  };

  await db.ref('/config/alcada').set(registroAlcada);

  await registrarAuditoria(
    {
      usuario: executor,
      modulo: 'admin/usuarios',
      eventoId: '',
      acao: 'Atualização de Alçada de Dupla Aprovação',
      resumo: `Alçada ${validado.ativo ? 'ATIVA' : 'INATIVA'} com limite de R$ ${validado.limiteDuplaAprovacaoReais.toFixed(2)}. Motivo: ${validado.motivo}`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: 'AlcadaDuplaAprovacaoAtualizada',
    origemModulo: 'admin/usuarios',
    referenciaId: 'config_alcada',
    payload: registroAlcada
  });

  return registroAlcada;
}

exports.atribuirPapelUsuarioERP = onCall(request => executarAtribuirPapelUsuarioERP(request));
exports.configurarAlcadaERP = onCall(request => executarConfigurarAlcadaERP(request));
exports.executarAtribuirPapelUsuarioERP = executarAtribuirPapelUsuarioERP;
exports.executarConfigurarAlcadaERP = executarConfigurarAlcadaERP;

exports.processar_admin_usuarios = onCall(async request => {
  if (request.data && request.data.uid) {
    return executarAtribuirPapelUsuarioERP(request);
  }
  const auth = request.auth;
  if (!auth || auth.token.role !== 'financeiro') {
    throw new HttpsError('permission-denied', 'Acesso restrito ao perfil Financeiro.');
  }
  const validacao = validarUsuarios(request.data || {});
  if (!validacao.valido) {
    throw new HttpsError('invalid-argument', validacao.erros.join(' '));
  }
  return { ok: true, id: 'admin/usuarios', no: 'usuarios_erp' };
});
