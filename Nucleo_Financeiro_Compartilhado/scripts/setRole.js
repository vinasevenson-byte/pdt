#!/usr/bin/env node
/**
 * Script Admin — Define Custom Claims (RBAC Granular) para usuários do Hub de Repasses DiskIngressos
 * Uso:
 *   node scripts/setRole.js <email> financeiro [operador|aprovador|auditor|fiscal|comercial]
 *   node scripts/setRole.js <email> <operador|aprovador|auditor|fiscal|comercial>
 *   node scripts/setRole.js <email> produtor <produtoraId>
 */

'use strict';

const admin = require('firebase-admin');
const { ROLES_SISTEMA, ROLES_PAINEL_INTERNO } = require('../packages/core/src/index.js');

const [, , email, roleArg, argExtra] = process.argv;

const rolesValidas = Object.values(ROLES_SISTEMA);

function montarClaims(role, extra) {
  if (!role || !rolesValidas.includes(role)) {
    throw new Error(`Role inválida "${role}". Valores aceitos: ${rolesValidas.join(', ')}`);
  }
  if (role === ROLES_SISTEMA.PRODUTOR) {
    if (!extra) {
      throw new Error('Para o perfil "produtor", informe obrigatoriamente o <produtoraId>.');
    }
    return { role: 'produtor', produtoraId: String(extra) };
  }
  // Para perfis internos (operador, aprovador, auditor, fiscal, comercial), mantém role='financeiro'
  // para compatibilidade com regras RTDB e define subRole granular para RBAC de ações.
  if (role === ROLES_SISTEMA.FINANCEIRO) {
    const subRole = extra && ROLES_PAINEL_INTERNO.has(extra) ? extra : 'financeiro';
    return { role: 'financeiro', subRole };
  }
  return { role: 'financeiro', subRole: role };
}

if (require.main === module) {
  let claims;
  try {
    if (!email) throw new Error('Informe o e-mail do usuário.');
    claims = montarClaims(roleArg, argExtra);
  } catch (err) {
    console.error(`Uso correto: node scripts/setRole.js <email> <${rolesValidas.join('|')}> [produtoraId|subRole]`);
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: 'diskingressos-62591',
      databaseURL: 'https://diskingressos-62591-default-rtdb.firebaseio.com'
    });
  }

  (async () => {
    try {
      const user = await admin.auth().getUserByEmail(email);
      await admin.auth().setCustomUserClaims(user.uid, claims);
      console.log(`✅ Claims aplicados com sucesso para ${email} (UID: ${user.uid}):`, JSON.stringify(claims));
      process.exit(0);
    } catch (err) {
      console.error('❌ Falha ao atribuir claims:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { montarClaims };
