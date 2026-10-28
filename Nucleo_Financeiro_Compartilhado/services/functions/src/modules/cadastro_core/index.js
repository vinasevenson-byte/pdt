/**
 * Callables do Cadastro Mestre (Fase 3, Módulo 1):
 * - salvarProdutora: cria/edita produtora com CNPJ único (reserva atômica em /cadastro_cnpj) e recálculo se patrocínio mudar
 * - salvarLocal: cria/edita local garantindo que alterações de setores/capacidade não quebrem eventos existentes
 * - salvarEvento: cria/edita evento recusando campos financeiros (jaRepassado, vendas, bilheteria), preservando-os contra corrida de repasse e bloqueando troca de produtoraId ou troca de localId após vendas
 * - alterarStatusCadastro: inativa/reativa produtora, local ou evento com motivo e bloqueios de segurança
 */

'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  registrarAuditoria,
  recalcularTodaProdutora,
  calcularCapacidadeEContadosEvento,
  validarSalvarProdutora,
  validarSalvarLocal,
  validarSalvarEvento,
  validarAlteracaoStatusCadastro,
  temPermissao,
  publicarEventoDominio
} = require('../../shared/recalculo');

const { onCall, HttpsError } = httpsV2;

async function executarSalvarProdutora(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'cadastro:gerenciar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "cadastro:gerenciar" (Financeiro, Comercial ou Aprovador) podem gerenciar o cadastro de produtoras.'
    );
  }

  const dados = request.data || {};
  const prodSnap = await db.ref('/produtoras').get();
  const todasProdutoras = (prodSnap && prodSnap.val()) || {};
  const produtoraExistente = dados.id && todasProdutoras[dados.id] ? todasProdutoras[dados.id] : null;

  let validado;
  try {
    validado = validarSalvarProdutora(dados, {
      produtoraExistente,
      todasProdutoras
    });
  } catch (err) {
    throw new HttpsError('invalid-argument', err.message);
  }

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const { id, cnpjLimpo, cnpjAnteriorLimpo, ehNovo, recalcularProdutora, registro } = validado;

  // Reserva atômica de CNPJ em /cadastro_cnpj/{cnpjLimpo} para proteger contra dois cadastros simultâneos
  if (ehNovo || cnpjAnteriorLimpo) {
    const cnpjRef = db.ref(`/cadastro_cnpj/${cnpjLimpo}`);
    let conflitoPorId = null;

    if (typeof cnpjRef.transaction === 'function') {
      const tx = await cnpjRef.transaction(current => {
        if (current && current.produtoraId && current.produtoraId !== id) {
          conflitoPorId = current.produtoraId;
          return;
        }
        return {
          cnpj: cnpjLimpo,
          produtoraId: id,
          reservadoPor: usuario,
          reservadoEm: agora
        };
      });

      if (conflitoPorId || !tx.committed) {
        throw new HttpsError(
          'already-exists',
          `CNPJ já reservado em /cadastro_cnpj para outra produtora (${conflitoPorId || 'concorrente'}).`
        );
      }
    } else {
      const checkCnpj = await cnpjRef.get();
      if (checkCnpj.exists() && checkCnpj.val().produtoraId !== id) {
        throw new HttpsError(
          'already-exists',
          `CNPJ já reservado em /cadastro_cnpj para a produtora ${checkCnpj.val().produtoraId}.`
        );
      }
      await cnpjRef.set({
        cnpj: cnpjLimpo,
        produtoraId: id,
        reservadoPor: usuario,
        reservadoEm: agora
      });
    }

    if (cnpjAnteriorLimpo && cnpjAnteriorLimpo !== cnpjLimpo) {
      await db.ref(`/cadastro_cnpj/${cnpjAnteriorLimpo}`).set(null);
    }
  }

  const payloadFinal = {
    ...registro,
    atualizadoPor: usuario,
    atualizadoEm: agora,
    ...(ehNovo ? { criadoPor: usuario, criadoEm: agora } : {})
  };

  await db.ref(`/produtoras/${id}`).set(payloadFinal);

  if (recalcularProdutora) {
    await recalcularTodaProdutora(id, null, db);
  }

  await registrarAuditoria(
    {
      usuario,
      modulo: 'CadastroMestre',
      eventoId: id,
      acao: ehNovo ? 'Criação de Produtora' : 'Edição de Produtora',
      resumo: `Produtora ${id} (${payloadFinal.nome}, CNPJ ${payloadFinal.cnpj}) ${ehNovo ? 'criada' : 'atualizada'} por ${usuario}.`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: ehNovo ? 'ProdutoraCriada' : 'ProdutoraAtualizada',
    origemModulo: 'CadastroMestre',
    referenciaId: id,
    produtoraId: id,
    payload: { id, nome: payloadFinal.nome, cnpj: payloadFinal.cnpj }
  });

  return { id, criado: ehNovo, ...payloadFinal };
}

async function executarSalvarLocal(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'cadastro:gerenciar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "cadastro:gerenciar" podem gerenciar o cadastro de locais.'
    );
  }

  const dados = request.data || {};
  const [locSnap, evSnap] = await Promise.all([
    db.ref('/locais').get(),
    db.ref('/eventos').get()
  ]);

  const todosLocais = (locSnap && locSnap.val()) || {};
  const todosEventos = (evSnap && evSnap.val()) || {};
  const localExistente = dados.id && todosLocais[dados.id] ? todosLocais[dados.id] : null;

  let validado;
  try {
    validado = validarSalvarLocal(dados, {
      localExistente,
      eventos: todosEventos
    });
  } catch (err) {
    throw new HttpsError('failed-precondition', err.message);
  }

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const { id, ehNovo, produtorasAfetadas, registro } = validado;

  const payloadFinal = {
    ...registro,
    atualizadoPor: usuario,
    atualizadoEm: agora,
    ...(ehNovo ? { criadoPor: usuario, criadoEm: agora } : {})
  };

  await db.ref(`/locais/${id}`).set(payloadFinal);

  for (const prodId of produtorasAfetadas) {
    await recalcularTodaProdutora(prodId, null, db);
  }

  await registrarAuditoria(
    {
      usuario,
      modulo: 'CadastroMestre',
      eventoId: id,
      acao: ehNovo ? 'Criação de Local' : 'Edição de Local',
      resumo: `Local ${id} (${payloadFinal.nome}, cap. ${payloadFinal.capacidadeTotal}) ${ehNovo ? 'criado' : 'atualizado'} por ${usuario}.`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: ehNovo ? 'LocalCriado' : 'LocalAtualizado',
    origemModulo: 'CadastroMestre',
    referenciaId: id,
    payload: { id, nome: payloadFinal.nome, capacidadeTotal: payloadFinal.capacidadeTotal }
  });

  return { id, criado: ehNovo, ...payloadFinal };
}

async function executarSalvarEvento(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'cadastro:gerenciar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "cadastro:gerenciar" podem gerenciar o cadastro de eventos.'
    );
  }

  const dados = request.data || {};
  const [evSnap, prodSnap, locSnap] = await Promise.all([
    dados.id ? db.ref(`/eventos/${dados.id}`).get() : Promise.resolve({ exists: () => false, val: () => null }),
    db.ref('/produtoras').get(),
    db.ref('/locais').get()
  ]);

  const eventoExistente = evSnap && evSnap.exists() ? evSnap.val() : null;
  const produtoras = (prodSnap && prodSnap.val()) || {};
  const locais = (locSnap && locSnap.val()) || {};

  let validado;
  try {
    validado = validarSalvarEvento(dados, {
      eventoExistente,
      produtoras,
      locais
    });
  } catch (err) {
    const ehErroArgumento =
      err.message.includes('recusa o campo') ||
      err.message.includes('Identificador') ||
      err.message.includes('obrigatório') ||
      err.message.includes('formato');
    throw new HttpsError(ehErroArgumento ? 'invalid-argument' : 'failed-precondition', err.message);
  }

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const { id, ehNovo, produtoraId, registro, eventoFinInicial } = validado;
  const localEscolhido = locais[registro.localId];

  // Hook opcional para testes simularem um repasse concorrente alterando jaRepassado antes da transação de escrita
  if (typeof deps.onBeforeWriteEvento === 'function') {
    await deps.onBeforeWriteEvento();
  }

  const evRef = db.ref(`/eventos/${id}`);
  let erroTransacao = null;
  let registroGravado = null;

  if (typeof evRef.transaction === 'function') {
    const tx = await evRef.transaction(current => {
      if (current) {
        if (current.produtoraId && current.produtoraId !== produtoraId) {
          erroTransacao = `O dono do evento (produtoraId="${current.produtoraId}") é imutável.`;
          return;
        }
        const vendidosAoVivo = Number((current.vendas && current.vendas.vendidos) || 0);
        const cortesiasAoVivo = Number((current.vendas && current.vendas.cortesias) || 0);
        const jaRepAoVivo = Number(current.jaRepassado || 0);
        const bilheteriaAoVivo = Number(current.bilheteria || 0);

        if (current.localId && current.localId !== registro.localId && (vendidosAoVivo > 0 || cortesiasAoVivo > 0 || jaRepAoVivo > 0)) {
          erroTransacao = `Não é permitido alterar o local do evento após vendas ou repasses.`;
          return;
        }

        const mesclado = {
          ...current,
          ...registro,
          vendas: {
            vendidos: vendidosAoVivo,
            cortesias: cortesiasAoVivo
          },
          bilheteria: bilheteriaAoVivo,
          jaRepassado: jaRepAoVivo,
          atualizadoPor: usuario,
          atualizadoEm: agora
        };

        const checkCap = calcularCapacidadeEContadosEvento(mesclado, localEscolhido);
        if (checkCap.capacidadeUsada < checkCap.ingressosContados) {
          erroTransacao = `A capacidade (${checkCap.capacidadeUsada}) ficou menor que os ingressos contados (${checkCap.ingressosContados}).`;
          return;
        }

        registroGravado = mesclado;
        return mesclado;
      }

      const novo = {
        ...registro,
        criadoPor: usuario,
        criadoEm: agora,
        atualizadoPor: usuario,
        atualizadoEm: agora
      };
      registroGravado = novo;
      return novo;
    });

    if (erroTransacao || !tx.committed) {
      throw new HttpsError('failed-precondition', erroTransacao || 'Conflito ao salvar evento.');
    }
  } else {
    registroGravado = {
      ...registro,
      atualizadoPor: usuario,
      atualizadoEm: agora,
      ...(ehNovo ? { criadoPor: usuario, criadoEm: agora } : {})
    };
    await evRef.set(registroGravado);
  }

  // Se é um evento novo, inicializa /eventos_fin/{id} zerado caso ainda não exista
  if (ehNovo) {
    const finSnap = await db.ref(`/eventos_fin/${id}`).get();
    if (!finSnap.exists()) {
      await db.ref(`/eventos_fin/${id}`).set(eventoFinInicial);
    }
  }

  await recalcularTodaProdutora(produtoraId, null, db);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'CadastroMestre',
      eventoId: id,
      acao: ehNovo ? 'Criação de Evento' : 'Edição de Evento',
      resumo: `Evento ${id} (${registroGravado.nome}, data ${registroGravado.data}, local ${registroGravado.localId}) ${ehNovo ? 'criado' : 'atualizado'} por ${usuario}.`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: ehNovo ? 'EventoCriado' : 'EventoAtualizado',
    origemModulo: 'CadastroMestre',
    referenciaId: id,
    produtoraId,
    payload: { id, nome: registroGravado.nome, localId: registroGravado.localId, data: registroGravado.data }
  });

  return { id, criado: ehNovo, ...registroGravado };
}

async function executarAlterarStatusCadastro(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'cadastro:gerenciar')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "cadastro:gerenciar" podem inativar ou reativar cadastros.'
    );
  }

  const dados = request.data || {};
  const [prodSnap, locSnap, evSnap, repSnap, antSnap] = await Promise.all([
    db.ref('/produtoras').get(),
    db.ref('/locais').get(),
    db.ref('/eventos').get(),
    db.ref('/repasses').get(),
    db.ref('/antecipacoes').get()
  ]);

  let validado;
  try {
    validado = validarAlteracaoStatusCadastro(dados, {
      produtoras: (prodSnap && prodSnap.val()) || {},
      locais: (locSnap && locSnap.val()) || {},
      eventos: (evSnap && evSnap.val()) || {},
      repasses: (repSnap && repSnap.val()) || {},
      antecipacoes: (antSnap && antSnap.val()) || {}
    });
  } catch (err) {
    const ehArg = err.message.includes('motivo') || err.message.includes('tipo') || err.message.includes('identificador');
    throw new HttpsError(ehArg ? 'invalid-argument' : 'failed-precondition', err.message);
  }

  const usuario = auth.token.email || auth.uid;
  const agora = formatarDataHoraBR(nowDate);
  const { colecao, id, ativo, motivo, produtorasAfetadas, registroAtualizado } = validado;

  const payloadFinal = {
    ...registroAtualizado,
    statusAlteradoPor: usuario,
    statusAlteradoEm: agora
  };

  await db.ref(`/${colecao}/${id}`).set(payloadFinal);

  for (const prodId of produtorasAfetadas) {
    await recalcularTodaProdutora(prodId, null, db);
  }

  await registrarAuditoria(
    {
      usuario,
      modulo: 'CadastroMestre',
      eventoId: id,
      acao: `${ativo ? 'Reativação' : 'Inativação'} de Cadastro (${dados.tipo})`,
      resumo: `${dados.tipo} ${id} ${ativo ? 'reativado' : `inativado (motivo: ${motivo})`} por ${usuario}.`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: ativo ? 'CadastroReativado' : 'CadastroInativado',
    origemModulo: 'CadastroMestre',
    referenciaId: id,
    payload: { tipo: dados.tipo, id, ativo, motivo }
  });

  return { id, ...payloadFinal };
}

exports.salvarProdutora = onCall(req => executarSalvarProdutora(req));
exports.salvarLocal = onCall(req => executarSalvarLocal(req));
exports.salvarEvento = onCall(req => executarSalvarEvento(req));
exports.alterarStatusCadastro = onCall(req => executarAlterarStatusCadastro(req));

exports.executarSalvarProdutora = executarSalvarProdutora;
exports.executarSalvarLocal = executarSalvarLocal;
exports.executarSalvarEvento = executarSalvarEvento;
exports.executarAlterarStatusCadastro = executarAlterarStatusCadastro;
