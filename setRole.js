#!/usr/bin/env node
/**
 * Script Admin — Define Custom Claims para usuários do Hub de Repasses DiskIngressos
 * Uso:
 *   node setRole.js <email> financeiro
 *   node setRole.js <email> produtor <produtoraId>
 *
 * Pré-requisito: variável GOOGLE_APPLICATION_CREDENTIALS apontando para a chave
 * de serviço do projeto Firebase `diskingressos-62591`.
 */

const admin = require('firebase-admin');

const [, , email, role, produtoraId] = process.argv;

if (!email || !role || !['financeiro', 'produtor'].includes(role)) {
  console.error('Uso correto: node setRole.js <email> <financeiro|produtor> [produtoraId]');
  process.exit(1);
}

if (role === 'produtor' && !produtoraId) {
  console.error('Erro: Para o perfil "produtor", informe obrigatoriamente o <produtoraId>.');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'diskingressos-62591',
    databaseURL: 'https://diskingressos-62591-default-rtdb.firebaseio.com'
  });
}

async function main() {
  try {
    const user = await admin.auth().getUserByEmail(email);
    const claims = role === 'financeiro'
      ? { role: 'financeiro' }
      : { role: 'produtor', produtoraId };

    await admin.auth().setCustomUserClaims(user.uid, claims);
    console.log(`✅ Claims aplicados com sucesso para ${email} (UID: ${user.uid}):`, JSON.stringify(claims));
    process.exit(0);
  } catch (err) {
    console.error('❌ Falha ao atribuir claims:', err.message);
    process.exit(1);
  }
}

main();
