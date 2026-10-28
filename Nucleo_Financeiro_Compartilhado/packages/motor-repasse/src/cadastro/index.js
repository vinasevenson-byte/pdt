/**
 * Biblioteca Pura do Cadastro Mestre (Fase 3, Módulo 1)
 * - Validação de identificadores de caminho RTDB ([a-z0-9_])
 * - Validação de dígitos verificadores e unicidade de CNPJ (preservando CNPJ legado inalterado)
 * - Regras de criação/edição de Produtoras, Locais e Eventos
 * - Proteção contra sobrescrita de campos financeiros (jaRepassado, vendas, bilheteria)
 * - Imutabilidade de produtoraId no evento e trava de localId após vendas
 * - Validação de capacidade (nunca menor que ingressos contados; edição de setores de local não quebra eventos)
 * - Bloqueios de inativação (produtora/local com eventos ativos, produtora/evento com repasse em andamento)
 */

'use strict';

const { round2 } = require('../shared/money');

const REGEX_ID_RTDB = /^[a-z0-9_]{2,64}$/;

function validarIdCadastro(id) {
  return typeof id === 'string' && REGEX_ID_RTDB.test(id.trim());
}

function gerarIdCadastro(prefixo = 'cad', nome = '') {
  const base = String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const sufixo = Math.random().toString(36).slice(2, 7).replace(/[^a-z0-9]/g, '0');
  const p = String(prefixo || 'cad').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const candidato = `${p}_${base || 'item'}_${sufixo}`.replace(/_+/g, '_').slice(0, 64);
  return candidato;
}

function normalizarCnpj(cnpj = '') {
  return String(cnpj || '').replace(/\D/g, '');
}

function formatarCnpj(cnpj = '') {
  const d = normalizarCnpj(cnpj);
  if (d.length !== 14) return String(cnpj || '').trim();
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/**
 * Valida os 2 dígitos verificadores oficiais do CNPJ (módulo 11).
 */
function validarDigitosCnpj(cnpj = '') {
  const d = normalizarCnpj(cnpj);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const calcDigito = (baseStr, pesos) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) {
      soma += Number(baseStr.charAt(i)) * pesos[i];
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const dig1 = calcDigito(d.slice(0, 12), pesos1);
  const dig2 = calcDigito(d.slice(0, 12) + String(dig1), pesos2);

  return Number(d.charAt(12)) === dig1 && Number(d.charAt(13)) === dig2;
}

/**
 * Calcula a capacidade efetiva e os ingressos contados de um evento diante de um local.
 */
function calcularCapacidadeEContadosEvento(evento = {}, local = {}) {
  const vendidos = Math.max(0, Number((evento.vendas && evento.vendas.vendidos) || evento.ingressosVendidos || 0));
  const cortesias = Math.max(0, Number((evento.vendas && evento.vendas.cortesias) || evento.cortesias || 0));
  const capObj = evento.capacidade || {};
  const modo = capObj.modo || 'local';
  const contarCortesias = Boolean(capObj.contarCortesias);
  const setoresLocal = Array.isArray(local && local.setores) ? local.setores : [];

  let capacidade = 0;
  const setoresInexistentes = [];

  if (modo === 'manual') {
    capacidade = Number(capObj.manual || 0);
  } else if (modo === 'setores') {
    const abertos = Array.isArray(capObj.setoresAbertos) ? capObj.setoresAbertos : [];
    for (const nomeSetor of abertos) {
      const encontrado = setoresLocal.find(s => s && s.nome === nomeSetor);
      if (!encontrado) {
        setoresInexistentes.push(nomeSetor);
      } else {
        capacidade += Number(encontrado.capacidade || 0);
      }
    }
  } else {
    capacidade = Number((local && local.capacidadeTotal) || 0);
    if (!capacidade && setoresLocal.length > 0) {
      capacidade = setoresLocal.reduce((acc, s) => acc + Number(s.capacidade || 0), 0);
    }
  }

  const ingressosContados = vendidos + (contarCortesias ? cortesias : 0);

  return {
    modo,
    capacidadeUsada: Math.max(0, Math.round(capacidade)),
    vendidos,
    cortesias,
    ingressosContados,
    setoresInexistentes
  };
}

/**
 * Valida criação ou edição de uma Produtora.
 * - Valida dígitos do CNPJ quando é novo ou quando mudou em relação ao registro existente.
 * - Garante unicidade do CNPJ entre todas as produtoras.
 */
function validarSalvarProdutora(dados = {}, { produtoraExistente = null, todasProdutoras = {} } = {}) {
  const id = dados.id ? String(dados.id).trim() : gerarIdCadastro('prod', dados.nome);
  if (!validarIdCadastro(id)) {
    throw new Error(`Identificador de produtora inválido ("${id}"). Use apenas letras minúsculas, números e sublinhado ([a-z0-9_]).`);
  }

  const nome = String(dados.nome || '').trim();
  if (nome.length < 3) {
    throw new Error('O nome da produtora é obrigatório (mínimo 3 caracteres).');
  }

  const cnpjLimpo = normalizarCnpj(dados.cnpj);
  if (cnpjLimpo.length !== 14) {
    throw new Error('Informe um CNPJ com 14 dígitos.');
  }

  const cnpjAnteriorLimpo = produtoraExistente ? normalizarCnpj(produtoraExistente.cnpj) : '';
  const cnpjMudouOuNovo = !produtoraExistente || cnpjLimpo !== cnpjAnteriorLimpo;

  if (cnpjMudouOuNovo && !validarDigitosCnpj(cnpjLimpo)) {
    throw new Error(`CNPJ inválido (${dados.cnpj}): dígitos verificadores não conferem.`);
  }

  // Verifica duplicidade em todasProdutoras
  for (const [outroId, prod] of Object.entries(todasProdutoras || {})) {
    if (!prod || outroId === id) continue;
    if (normalizarCnpj(prod.cnpj) === cnpjLimpo) {
      throw new Error(`Já existe outra produtora (${outroId}) cadastrada com o CNPJ ${formatarCnpj(cnpjLimpo)}.`);
    }
  }

  const patInput = dados.patrocinio || (produtoraExistente && produtoraExistente.patrocinio) || {
    ativo: false,
    descricao: '',
    valor: 0
  };
  const valorPat = round2(Number(patInput.valor || 0));
  if (!Number.isFinite(valorPat) || valorPat < 0) {
    throw new Error('O valor de patrocínio da produtora não pode ser negativo.');
  }

  const patrocinio = {
    ativo: Boolean(patInput.ativo),
    descricao: String(patInput.descricao || '').trim(),
    valor: valorPat
  };

  const patAnterior = (produtoraExistente && produtoraExistente.patrocinio) || { ativo: false, valor: 0 };
  const patrocinioMudou =
    Boolean(produtoraExistente) &&
    (Boolean(patAnterior.ativo) !== patrocinio.ativo || round2(patAnterior.valor) !== patrocinio.valor);

  const registro = {
    ...(produtoraExistente || {}),
    nome,
    cnpj: formatarCnpj(cnpjLimpo),
    patrocinio,
    ativo: produtoraExistente && produtoraExistente.ativo !== undefined ? Boolean(produtoraExistente.ativo) : true
  };

  return {
    id,
    cnpjLimpo,
    cnpjAnteriorLimpo: cnpjMudouOuNovo && cnpjAnteriorLimpo ? cnpjAnteriorLimpo : null,
    ehNovo: !produtoraExistente,
    recalcularProdutora: patrocinioMudou,
    registro
  };
}

/**
 * Valida criação ou edição de um Local.
 * - Valida setores e capacidadeTotal.
 * - Verifica se a alteração de setores/capacidade não quebra nenhum evento que já usa este local.
 */
function validarSalvarLocal(dados = {}, { localExistente = null, eventos = {} } = {}) {
  const id = dados.id ? String(dados.id).trim() : gerarIdCadastro('loc', dados.nome);
  if (!validarIdCadastro(id)) {
    throw new Error(`Identificador de local inválido ("${id}"). Use apenas [a-z0-9_].`);
  }

  const nome = String(dados.nome || '').trim();
  const cidade = String(dados.cidade || '').trim();
  const uf = String(dados.uf || '').trim().toUpperCase();

  if (nome.length < 3 || cidade.length < 2 || !/^[A-Z]{2}$/.test(uf)) {
    throw new Error('Informe nome, cidade e UF válida (2 letras) para o local.');
  }

  const setoresRaw = Array.isArray(dados.setores) ? dados.setores : [];
  if (setoresRaw.length === 0) {
    throw new Error('O local deve possuir ao menos um setor com capacidade maior que zero.');
  }

  const nomesSetores = new Set();
  let somaSetores = 0;
  const setores = setoresRaw.map(s => {
    const nomeSetor = String((s && s.nome) || '').trim();
    const capSetor = Math.round(Number((s && s.capacidade) || 0));
    if (!nomeSetor || capSetor <= 0) {
      throw new Error('Cada setor do local deve ter nome preenchido e capacidade inteira positiva.');
    }
    const chave = nomeSetor.toLowerCase();
    if (nomesSetores.has(chave)) {
      throw new Error(`Setor duplicado no local: "${nomeSetor}".`);
    }
    nomesSetores.add(chave);
    somaSetores += capSetor;
    return { nome: nomeSetor, capacidade: capSetor };
  });

  const capacidadeTotal = dados.capacidadeTotal !== undefined ? Math.round(Number(dados.capacidadeTotal)) : somaSetores;
  if (capacidadeTotal <= 0 || capacidadeTotal < somaSetores) {
    throw new Error(`A capacidadeTotal (${capacidadeTotal}) não pode ser menor que a soma dos setores (${somaSetores}).`);
  }

  const novoLocal = {
    ...(localExistente || {}),
    nome,
    cidade,
    uf,
    capacidadeTotal,
    setores,
    ativo: localExistente && localExistente.ativo !== undefined ? Boolean(localExistente.ativo) : true
  };

  // Verifica se algum evento vinculado a este local ficaria inconsistente
  const produtorasAfetadas = new Set();
  const listaEventos = Array.isArray(eventos)
    ? eventos
    : Object.entries(eventos || {}).map(([evId, ev]) => ({ ...ev, id: ev.id || evId }));

  for (const ev of listaEventos) {
    if (!ev || ev.localId !== id) continue;
    if (ev.produtoraId) produtorasAfetadas.add(ev.produtoraId);

    const checkCap = calcularCapacidadeEContadosEvento(ev, novoLocal);
    if (checkCap.setoresInexistentes.length > 0) {
      throw new Error(
        `Não é possível remover o(s) setor(es) [${checkCap.setoresInexistentes.join(', ')}] do local "${id}" porque o evento "${ev.id}" os utiliza.`
      );
    }
    if (checkCap.capacidadeUsada <= 0) {
      throw new Error(`A alteração do local deixaria o evento "${ev.id}" com capacidade zero.`);
    }
    if (checkCap.capacidadeUsada < checkCap.ingressosContados) {
      throw new Error(
        `A alteração do local reduziria a capacidade do evento "${ev.id}" (${checkCap.capacidadeUsada}) abaixo dos ingressos já contados (${checkCap.ingressosContados}).`
      );
    }
  }

  return {
    id,
    ehNovo: !localExistente,
    produtorasAfetadas: Array.from(produtorasAfetadas),
    registro: novoLocal
  };
}

/**
 * Valida criação ou edição de um Evento.
 * Regras críticas:
 * - Recusa jaRepassado, vendas e bilheteria no payload de entrada.
 * - produtoraId é imutável após a criação.
 * - localId não pode mudar se já houver ingressos vendidos/cortesias ou valor repassado.
 * - Capacidade resultante nunca pode ser menor que os ingressos já contados.
 */
function validarSalvarEvento(dados = {}, { eventoExistente = null, produtoras = {}, locais = {} } = {}) {
  const camposFinanceirosProibidos = ['jaRepassado', 'vendas', 'bilheteria', 'ingressosVendidos'];
  for (const campo of camposFinanceirosProibidos) {
    if (Object.prototype.hasOwnProperty.call(dados || {}, campo) && dados[campo] !== undefined) {
      throw new Error(
        `O cadastro mestre recusa o campo "${campo}": vendas, bilheteria e jaRepassado nascem zerados e só mudam por operações de venda e repasse.`
      );
    }
  }

  const id = dados.id ? String(dados.id).trim() : gerarIdCadastro('ev', dados.nome);
  if (!validarIdCadastro(id)) {
    throw new Error(`Identificador de evento inválido ("${id}"). Use apenas [a-z0-9_].`);
  }

  const nome = String(dados.nome || '').trim();
  const data = String(dados.data || '').trim();
  const produtoraId = String(dados.produtoraId || '').trim();
  const localId = String(dados.localId || '').trim();

  if (nome.length < 2) {
    throw new Error('O nome do evento é obrigatório.');
  }
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    throw new Error('A data do evento deve estar no formato DD/MM/YYYY.');
  }
  if (!validarIdCadastro(produtoraId)) {
    throw new Error('Informe um produtoraId válido.');
  }
  if (!validarIdCadastro(localId)) {
    throw new Error('Informe um localId válido.');
  }

  if (eventoExistente && eventoExistente.produtoraId && eventoExistente.produtoraId !== produtoraId) {
    throw new Error(
      `O dono do evento (produtoraId="${eventoExistente.produtoraId}") é imutável e não pode ser alterado para "${produtoraId}".`
    );
  }

  const produtora = (produtoras || {})[produtoraId];
  if (!produtora) {
    throw new Error(`Produtora "${produtoraId}" não encontrada.`);
  }
  if (!eventoExistente && produtora.ativo === false) {
    throw new Error(`Não é permitido criar evento para a produtora inativa "${produtoraId}".`);
  }

  const local = (locais || {})[localId];
  if (!local) {
    throw new Error(`Local "${localId}" não encontrado.`);
  }
  if ((!eventoExistente || eventoExistente.localId !== localId) && local.ativo === false) {
    throw new Error(`Não é permitido vincular evento ao local inativo "${localId}".`);
  }

  const vendasAtuais = (eventoExistente && eventoExistente.vendas) || { vendidos: 0, cortesias: 0 };
  const vendidosAtuais = Number(vendasAtuais.vendidos || (eventoExistente && eventoExistente.ingressosVendidos) || 0);
  const cortesiasAtuais = Number(vendasAtuais.cortesias || (eventoExistente && eventoExistente.cortesias) || 0);
  const bilheteriaAtual = round2(Number((eventoExistente && eventoExistente.bilheteria) || 0));
  const jaRepassadoAtual = round2(Number((eventoExistente && eventoExistente.jaRepassado) || 0));

  if (eventoExistente && eventoExistente.localId && eventoExistente.localId !== localId) {
    if (vendidosAtuais > 0 || cortesiasAtuais > 0 || jaRepassadoAtual > 0) {
      throw new Error(
        `Não é permitido alterar o local do evento ("${eventoExistente.localId}" -> "${localId}") depois de haver ingressos vendidos ou repasses realizados.`
      );
    }
  }

  const capInput = dados.capacidade || (eventoExistente && eventoExistente.capacidade) || {
    modo: 'local',
    setoresAbertos: (local.setores || []).map(s => s.nome),
    manual: local.capacidadeTotal || 0,
    contarCortesias: false
  };

  const modoCap = capInput.modo || 'local';
  if (!['local', 'setores', 'manual'].includes(modoCap)) {
    throw new Error('O modo de capacidade do evento deve ser "local", "setores" ou "manual".');
  }

  const capacidade = {
    modo: modoCap,
    setoresAbertos: Array.isArray(capInput.setoresAbertos) ? capInput.setoresAbertos.map(String) : [],
    manual: Math.max(0, Math.round(Number(capInput.manual || 0))),
    contarCortesias: Boolean(capInput.contarCortesias)
  };

  const candidatoEvento = {
    ...(eventoExistente || {}),
    produtoraId,
    nome,
    data,
    localId,
    capacidade,
    vendas: {
      vendidos: vendidosAtuais,
      cortesias: cortesiasAtuais
    },
    bilheteria: bilheteriaAtual,
    jaRepassado: jaRepassadoAtual
  };

  const checkCap = calcularCapacidadeEContadosEvento(candidatoEvento, local);
  if (checkCap.setoresInexistentes.length > 0) {
    throw new Error(
      `O(s) setor(es) [${checkCap.setoresInexistentes.join(', ')}] não existe(m) no local "${localId}".`
    );
  }
  if (checkCap.capacidadeUsada <= 0) {
    throw new Error('A capacidade efetiva do evento deve ser maior que zero.');
  }
  if (checkCap.capacidadeUsada < checkCap.ingressosContados) {
    throw new Error(
      `A capacidade configurada (${checkCap.capacidadeUsada}) não pode ficar abaixo dos ingressos já contados no evento (${checkCap.ingressosContados}).`
    );
  }

  const ativoAtual =
    eventoExistente && eventoExistente.ativo !== undefined ? Boolean(eventoExistente.ativo) : true;
  const liberadoParaSolicitacao = !ativoAtual
    ? false
    : dados.liberadoParaSolicitacao !== undefined
    ? Boolean(dados.liberadoParaSolicitacao)
    : eventoExistente && eventoExistente.liberadoParaSolicitacao !== undefined
    ? Boolean(eventoExistente.liberadoParaSolicitacao)
    : true;

  const registro = {
    ...candidatoEvento,
    ativo: ativoAtual,
    liberadoParaSolicitacao
  };

  const eventoFinInicial = {
    taxaAdm: { ativo: false, percentual: 0 },
    retencoes: [],
    descontosOperacionais: [],
    rebate: { ativo: false, tipo: 'percentual', valor: 0 },
    patrocinioEvento: { ativo: false, descricao: '', valor: 0 }
  };

  return {
    id,
    ehNovo: !eventoExistente,
    produtoraId,
    capacidadeEfetiva: checkCap.capacidadeUsada,
    registro,
    eventoFinInicial
  };
}

const STATUS_REPASSE_EM_ANDAMENTO = new Set([
  'Solicitado',
  'AguardandoSegundaAprovacao',
  'Aprovado',
  'EmProcessamento'
]);

/**
 * Valida inativação ou reativação de Produtora, Local ou Evento.
 */
function validarAlteracaoStatusCadastro(
  { tipo, id, ativo, motivo = '' } = {},
  { produtoras = {}, locais = {}, eventos = {}, repasses = {}, antecipacoes = {} } = {}
) {
  if (!['produtora', 'local', 'evento'].includes(tipo)) {
    throw new Error('O tipo de cadastro deve ser "produtora", "local" ou "evento".');
  }
  if (!validarIdCadastro(id)) {
    throw new Error('Informe um identificador válido ([a-z0-9_]).');
  }
  if (typeof ativo !== 'boolean') {
    throw new Error('Informe o campo booleano "ativo" (true para reativar, false para inativar).');
  }

  const motivoLimpo = String(motivo || '').trim();
  if (!ativo && motivoLimpo.length < 3) {
    throw new Error('Informe obrigatoriamente o motivo para inativar o cadastro (mínimo 3 caracteres).');
  }

  const listaEventos = Object.entries(eventos || {}).map(([evId, ev]) => ({ ...ev, id: ev.id || evId }));
  const listaRepasses = Object.entries(repasses || {}).map(([repId, r]) => ({ ...r, id: r.id || repId }));
  const listaAntecipacoes = Object.entries(antecipacoes || {}).map(([antId, a]) => ({ ...a, id: a.id || antId }));

  if (tipo === 'produtora') {
    const prod = (produtoras || {})[id];
    if (!prod) throw new Error(`Produtora "${id}" não encontrada.`);

    if (!ativo) {
      const eventosAtivos = listaEventos.filter(e => e.produtoraId === id && e.ativo !== false);
      if (eventosAtivos.length > 0) {
        throw new Error(
          `Não é permitido inativar a produtora "${id}" enquanto possuir evento(s) ativo(s): ${eventosAtivos.map(e => e.id).join(', ')}.`
        );
      }
      const repassesAtivos = listaRepasses.filter(
        r => r.produtoraId === id && STATUS_REPASSE_EM_ANDAMENTO.has(r.status)
      );
      if (repassesAtivos.length > 0) {
        throw new Error(
          `Não é permitido inativar a produtora "${id}" enquanto possuir repasse(s) em andamento: ${repassesAtivos.map(r => r.id).join(', ')}.`
        );
      }
    }

    return {
      colecao: 'produtoras',
      id,
      ativo,
      motivo: motivoLimpo,
      produtorasAfetadas: [id],
      registroAtualizado: {
        ...prod,
        ativo,
        motivoInativacao: !ativo ? motivoLimpo : null
      }
    };
  }

  if (tipo === 'local') {
    const loc = (locais || {})[id];
    if (!loc) throw new Error(`Local "${id}" não encontrado.`);

    const eventosDoLocal = listaEventos.filter(e => e.localId === id);
    if (!ativo) {
      const eventosAtivos = eventosDoLocal.filter(e => e.ativo !== false);
      if (eventosAtivos.length > 0) {
        throw new Error(
          `Não é permitido inativar o local "${id}" enquanto possuir evento(s) ativo(s): ${eventosAtivos.map(e => e.id).join(', ')}.`
        );
      }
    }

    const produtorasAfetadas = Array.from(new Set(eventosDoLocal.map(e => e.produtoraId).filter(Boolean)));
    return {
      colecao: 'locais',
      id,
      ativo,
      motivo: motivoLimpo,
      produtorasAfetadas,
      registroAtualizado: {
        ...loc,
        ativo,
        motivoInativacao: !ativo ? motivoLimpo : null
      }
    };
  }

  // tipo === 'evento'
  const ev = (eventos || {})[id];
  if (!ev) throw new Error(`Evento "${id}" não encontrado.`);

  if (!ativo) {
    const repassesDoEvento = listaRepasses.filter(
      r =>
        Array.isArray(r.eventoIds) &&
        r.eventoIds.includes(id) &&
        STATUS_REPASSE_EM_ANDAMENTO.has(r.status)
    );
    if (repassesDoEvento.length > 0) {
      throw new Error(
        `Não é permitido inativar o evento "${id}" enquanto possuir repasse(s) em andamento: ${repassesDoEvento.map(r => r.id).join(', ')}.`
      );
    }

    const antsEmAndamento = listaAntecipacoes.filter(
      a => a.eventoId === id && (a.status === 'Solicitada' || a.status === 'EmProcessamento')
    );
    if (antsEmAndamento.length > 0) {
      throw new Error(
        `Não é permitido inativar o evento "${id}" enquanto possuir antecipação em análise: ${antsEmAndamento.map(a => a.id).join(', ')}.`
      );
    }
  } else {
    const prod = (produtoras || {})[ev.produtoraId];
    if (prod && prod.ativo === false) {
      throw new Error(`Não é permitido reativar o evento "${id}" porque sua produtora ("${ev.produtoraId}") está inativa.`);
    }
    const loc = (locais || {})[ev.localId];
    if (loc && loc.ativo === false) {
      throw new Error(`Não é permitido reativar o evento "${id}" porque seu local ("${ev.localId}") está inativo.`);
    }
  }

  return {
    colecao: 'eventos',
    id,
    ativo,
    motivo: motivoLimpo,
    produtorasAfetadas: ev.produtoraId ? [ev.produtoraId] : [],
    registroAtualizado: {
      ...ev,
      ativo,
      liberadoParaSolicitacao: ativo ? true : false,
      motivoInativacao: !ativo ? motivoLimpo : null
    }
  };
}

module.exports = {
  validarIdCadastro,
  gerarIdCadastro,
  normalizarCnpj,
  formatarCnpj,
  validarDigitosCnpj,
  calcularCapacidadeEContadosEvento,
  validarSalvarProdutora,
  validarSalvarLocal,
  validarSalvarEvento,
  validarAlteracaoStatusCadastro
};
