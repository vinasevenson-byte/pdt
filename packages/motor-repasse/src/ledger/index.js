/**
 * Motor do Ledger Imutável (/lancamentos) com Partida Dobrada, Plano de Contas,
 * Balancete por Conta, Selo SHA-256 e Fechamento/Reabertura Mensal (/fechamentos)
 */

'use strict';

const crypto = require('node:crypto');
const { toCents, fromCents } = require('../shared/money');

/**
 * Plano de Contas Oficial do Núcleo Financeiro DiskIngressos
 */
const PLANO_CONTAS = Object.freeze({
  BANCO_CONTA_MOVIMENTO: '1.1.01.001 - Conta Movimento Bancária Disk',
  CLIENTES_ADQUIRENTES_RECEBER: '1.1.02.001 - Clientes e Adquirentes a Receber',
  ADIANTAMENTOS_ANTECIPACOES_PRODUTOR: '1.1.03.001 - Antecipações Concedidas a Produtores',
  OBRIGACOES_REPASSES_PRODUTOR: '2.1.01.001 - Obrigações de Repasse Produtor',
  OBRIGACOES_RETENCOES_RECOLHER: '2.1.01.002 - Retenções de Eventos a Recolher',
  RECEITA_TAXAS_DISK: '3.1.01.001 - Receita de Taxas (Adm/Op) Disk',
  RECEITA_ENCARGOS_ANTECIPACAO: '3.1.02.002 - Receita de Encargos sobre Antecipação',
  RECEITA_TARIFA_TRANSFERENCIA: '4.1.02.01 - Receita de Tarifa de Transferência (TED)',
  DESPESA_TARIFAS_BANCARIAS: '4.1.01.001 - Despesas de MDR e Tarifas Bancárias'
});

/**
 * Formata uma instância Date para DD/MM/YYYY no fuso America/Sao_Paulo (evita virada de dia/mês em UTC).
 */
function obterDataAtualBR(date = new Date()) {
  const dt = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(dt);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return `${map.day}/${map.month}/${map.year}`;
}

function extrairCompetencia(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return '';
  const limpo = dataStr.trim();
  const mBR = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(limpo);
  if (mBR) return `${mBR[3]}-${mBR[2]}`;
  const mISO = /^(\d{4})-(\d{2})/.exec(limpo);
  if (mISO) return `${mISO[1]}-${mISO[2]}`;
  return '';
}

/**
 * Retorna a competência contábil (YYYY-MM) no fuso America/Sao_Paulo.
 */
function obterCompetenciaAtualBR(date = new Date()) {
  return extrairCompetencia(obterDataAtualBR(date));
}

function validarFormatoCompetencia(competencia) {
  return typeof competencia === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia.trim());
}

function competenciaAnterior(competencia) {
  if (!validarFormatoCompetencia(competencia)) return '';
  const [anoStr, mesStr] = competencia.trim().split('-');
  let ano = Number(anoStr);
  let mes = Number(mesStr) - 1;
  if (mes < 1) {
    mes = 12;
    ano -= 1;
  }
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}`;
}

function competenciaSeguinte(competencia) {
  if (!validarFormatoCompetencia(competencia)) return '';
  const [anoStr, mesStr] = competencia.trim().split('-');
  let ano = Number(anoStr);
  let mes = Number(mesStr) + 1;
  if (mes > 12) {
    mes = 1;
    ano += 1;
  }
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}`;
}

/**
 * Retorna true se a competência está fechada OU em processo de fechamento (trava ativa).
 */
function competenciaEstaFechada(competencia, fechamentosMap = {}) {
  if (!competencia || !fechamentosMap) return false;
  const fech = fechamentosMap[competencia];
  if (!fech) return false;
  return Boolean(
    fech.fechado === true ||
      fech.status === 'Fechado' ||
      fech.status === 'Fechando' ||
      fech.emFechamento === true
  );
}

/**
 * Cria um lançamento contábil imutável com partida dobrada.
 */
function criarLancamentoPartidaDobrada(params = {}, fechamentosMap = {}) {
  const valorCents = params.valorCents !== undefined ? Math.round(Number(params.valorCents)) : toCents(params.valor);
  const dataEfetiva = params.data || params.dataLancamento || obterDataAtualBR();
  const competencia = params.competencia || extrairCompetencia(dataEfetiva);

  if (!Number.isFinite(valorCents) || valorCents <= 0) {
    throw new Error('O lançamento de partida dobrada exige valor maior que zero.');
  }
  if (!params.contaDebito || !params.contaCredito) {
    throw new Error('Informe obrigatoriamente contaDebito e contaCredito.');
  }
  if (String(params.contaDebito).trim() === String(params.contaCredito).trim()) {
    throw new Error('contaDebito e contaCredito devem ser distintas na partida dobrada.');
  }
  if (!validarFormatoCompetencia(competencia)) {
    throw new Error('Competência (YYYY-MM) ou data válida (DD/MM/YYYY) é obrigatória.');
  }
  if (competenciaEstaFechada(competencia, fechamentosMap)) {
    throw new Error(`A competência ${competencia} já está encerrada em /fechamentos e bloqueia lançamentos retroativos.`);
  }

  return {
    id: params.id || null,
    data: dataEfetiva,
    dataLancamento: dataEfetiva,
    competencia,
    contaDebito: String(params.contaDebito).trim(),
    contaCredito: String(params.contaCredito).trim(),
    valorCents,
    valor: fromCents(valorCents),
    produtoraId: params.produtoraId || null,
    eventoId: params.eventoId || null,
    origemModulo: String(params.origemModulo || 'manual'),
    origemId: String(params.origemId || ''),
    historico: String(params.historico || ''),
    tipo: params.estornoDeId ? 'estorno' : 'original',
    estornoDeId: params.estornoDeId || null,
    criadoPor: String(params.criadoPor || params.usuario || 'financeiro'),
    usuario: String(params.usuario || params.criadoPor || 'financeiro'),
    criadoEm: params.criadoEm || dataEfetiva,
    imutavel: true
  };
}

/**
 * Gera um lançamento de estorno invertendo contaDebito e contaCredito (nunca edita o lançamento original).
 */
function gerarEstornoLancamento(lancamentoOriginal = {}, dadosEstorno = {}, fechamentosMap = {}) {
  if (!lancamentoOriginal || !lancamentoOriginal.id) {
    throw new Error('Lançamento original com id é obrigatório para estorno.');
  }
  if (!dadosEstorno.motivo || String(dadosEstorno.motivo).trim().length < 3) {
    throw new Error('Motivo do estorno é obrigatório.');
  }

  const dataEstorno = dadosEstorno.data || lancamentoOriginal.data || obterDataAtualBR();
  const competenciaEstorno = dadosEstorno.competencia || extrairCompetencia(dataEstorno);

  return criarLancamentoPartidaDobrada(
    {
      id: dadosEstorno.id || null,
      data: dataEstorno,
      competencia: competenciaEstorno,
      contaDebito: lancamentoOriginal.contaCredito,
      contaCredito: lancamentoOriginal.contaDebito,
      valorCents: lancamentoOriginal.valorCents || toCents(lancamentoOriginal.valor),
      produtoraId: lancamentoOriginal.produtoraId,
      eventoId: lancamentoOriginal.eventoId,
      origemModulo: lancamentoOriginal.origemModulo,
      origemId: lancamentoOriginal.origemId,
      historico: `ESTORNO (#${lancamentoOriginal.id}): ${String(dadosEstorno.motivo).trim()}`,
      estornoDeId: lancamentoOriginal.id,
      criadoPor: dadosEstorno.usuario || 'financeiro',
      criadoEm: dadosEstorno.criadoEm || dataEstorno
    },
    fechamentosMap
  );
}

/**
 * Normaliza um mapa ou array de lançamentos preservando o id de cada registro.
 */
function normalizarListaLancamentos(lancamentos = {}) {
  if (Array.isArray(lancamentos)) {
    return lancamentos
      .filter(Boolean)
      .map((l, idx) => ({ ...l, id: l.id || `idx_${idx}` }));
  }
  return Object.entries(lancamentos || {})
    .filter(([, l]) => l && typeof l === 'object')
    .map(([id, l]) => ({ ...l, id: l.id || id }));
}

/**
 * Calcula o selo SHA-256 determinístico sobre os lançamentos de uma competência.
 * Qualquer alteração em valor, conta, origem ou quantidade muda o hash.
 */
function calcularSeloFechamento(competencia, lancamentos = {}) {
  const lista = normalizarListaLancamentos(lancamentos)
    .filter(l => (l.competencia || extrairCompetencia(l.data)) === competencia)
    .map(l => ({
      id: String(l.id || ''),
      competencia: String(l.competencia || extrairCompetencia(l.data) || ''),
      data: String(l.data || l.dataLancamento || ''),
      contaDebito: String(l.contaDebito || '').trim(),
      contaCredito: String(l.contaCredito || '').trim(),
      valorCents: l.valorCents !== undefined ? Number(l.valorCents) : toCents(l.valor),
      valor: Number(l.valor !== undefined ? l.valor : fromCents(l.valorCents || 0)),
      origemModulo: String(l.origemModulo || ''),
      origemId: String(l.origemId || ''),
      tipo: String(l.tipo || (l.estornoDeId ? 'estorno' : 'original')),
      estornoDeId: l.estornoDeId ? String(l.estornoDeId) : null
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const payloadCanonico = JSON.stringify({
    competencia,
    quantidadeLancamentos: lista.length,
    lancamentos: lista
  });

  return crypto.createHash('sha256').update(payloadCanonico, 'utf8').digest('hex');
}

/**
 * Calcula o balancete por conta contábil para uma competência específica.
 */
function calcularBalanceteCompetencia(competencia, lancamentos = {}) {
  const lista = normalizarListaLancamentos(lancamentos).filter(
    l => (l.competencia || extrairCompetencia(l.data)) === competencia
  );

  const contasMap = new Map();
  let totalDebitosCents = 0;
  let totalCreditosCents = 0;

  function garantirConta(nomeConta) {
    const chave = String(nomeConta || '(Sem Conta)').trim() || '(Sem Conta)';
    if (!contasMap.has(chave)) {
      contasMap.set(chave, {
        conta: chave,
        debitoCents: 0,
        creditoCents: 0,
        saldoCents: 0,
        debito: 0,
        credito: 0,
        saldo: 0,
        qtdDebitos: 0,
        qtdCreditos: 0
      });
    }
    return contasMap.get(chave);
  }

  for (const l of lista) {
    const cents =
      l.valorCents !== undefined && Number.isFinite(Number(l.valorCents))
        ? Math.round(Number(l.valorCents))
        : toCents(l.valor);

    const debCents =
      l.debitoCents !== undefined && Number.isFinite(Number(l.debitoCents))
        ? Math.round(Number(l.debitoCents))
        : cents;
    const credCents =
      l.creditoCents !== undefined && Number.isFinite(Number(l.creditoCents))
        ? Math.round(Number(l.creditoCents))
        : cents;

    if (l.contaDebito) {
      const cDeb = garantirConta(l.contaDebito);
      cDeb.debitoCents += debCents;
      cDeb.qtdDebitos += 1;
      totalDebitosCents += debCents;
    }

    if (l.contaCredito) {
      const cCred = garantirConta(l.contaCredito);
      cCred.creditoCents += credCents;
      cCred.qtdCreditos += 1;
      totalCreditosCents += credCents;
    }
  }

  const contas = Array.from(contasMap.values())
    .map(c => {
      const saldoCents = c.debitoCents - c.creditoCents;
      return {
        ...c,
        saldoCents,
        debito: fromCents(c.debitoCents),
        credito: fromCents(c.creditoCents),
        saldo: fromCents(saldoCents)
      };
    })
    .sort((a, b) => a.conta.localeCompare(b.conta));

  const diferencaCents = totalDebitosCents - totalCreditosCents;

  return {
    competencia,
    quantidadeLancamentos: lista.length,
    totalDebitosCents,
    totalCreditosCents,
    diferencaCents,
    totalDebitos: fromCents(totalDebitosCents),
    totalCreditos: fromCents(totalCreditosCents),
    diferenca: fromCents(diferencaCents),
    balanceado: diferencaCents === 0,
    contas
  };
}

/**
 * Verifica se um fechamento respeita a regra de mês já encerrado e sequência cronológica (jan -> fev -> mar).
 */
function verificarSequenciaFechamento(
  competencia,
  { lancamentos = {}, fechamentos = {}, competenciaAtual = obterCompetenciaAtualBR() } = {}
) {
  const bloqueios = [];

  if (!validarFormatoCompetencia(competencia)) {
    bloqueios.push({
      codigo: 'competencia_invalida',
      mensagem: `A competência "${competencia}" não está no formato válido YYYY-MM.`
    });
    return { valido: false, bloqueios };
  }

  if (competenciaAtual && validarFormatoCompetencia(competenciaAtual) && competencia >= competenciaAtual) {
    bloqueios.push({
      codigo: 'competencia_em_curso_ou_futura',
      mensagem: `Não é permitido fechar a competência ${competencia} porque ainda está em curso ou no futuro (competência atual: ${competenciaAtual}). Só é permitido fechar mês já encerrado.`
    });
  }

  // Descobre a primeira competência existente no histórico (entre lançamentos e fechamentos)
  const todasCompetencias = new Set();
  for (const l of normalizarListaLancamentos(lancamentos)) {
    const c = l.competencia || extrairCompetencia(l.data);
    if (validarFormatoCompetencia(c)) todasCompetencias.add(c);
  }
  for (const [k, f] of Object.entries(fechamentos || {})) {
    const c = (f && f.competencia) || k;
    if (validarFormatoCompetencia(c)) todasCompetencias.add(c);
  }

  const ordenadas = Array.from(todasCompetencias).sort();
  const primeiraCompetencia = ordenadas.length > 0 ? ordenadas[0] : competencia;

  // Se existe alguma competência anterior à solicitada no histórico, a imediatamente anterior deve estar fechada!
  if (competencia > primeiraCompetencia) {
    const ant = competenciaAnterior(competencia);
    const fechAnt = (fechamentos || {})[ant];
    const antFechada = Boolean(fechAnt && fechAnt.fechado === true);
    if (!antFechada) {
      bloqueios.push({
        codigo: 'sequencia_violada',
        competenciaAnterior: ant,
        mensagem: `Fechamento fora de sequência: a competência anterior (${ant}) precisa estar fechada antes de fechar ${competencia}.`
      });
    }
  }

  return {
    valido: bloqueios.length === 0,
    primeiraCompetencia,
    bloqueios
  };
}

/**
 * Calcula a prévia completa de fechamento mensal (somente leitura):
 * - Bloqueios: lançamento inválido, balancete desbalanceado, repasse Pago sem lançamento no ledger,
 *   devolução sem contrapartida, mês em curso/futuro, quebra de sequência e adulteração de selo SHA-256.
 * - Avisos e Balancete por conta.
 */
function calcularPreviaFechamento({
  competencia,
  lancamentos = {},
  repasses = {},
  estornos = {},
  fechamentos = {},
  competenciaAtual = obterCompetenciaAtualBR(),
  ignorarTravaPropria = false
} = {}) {
  const bloqueios = [];
  const avisos = [];

  if (!validarFormatoCompetencia(competencia)) {
    return {
      competencia,
      valido: false,
      aptoParaFechar: false,
      fechado: false,
      emFechamento: false,
      bloqueios: [
        {
          codigo: 'competencia_invalida',
          mensagem: 'Informe a competência no formato YYYY-MM (mês 01 a 12).'
        }
      ],
      avisos: [],
      balancete: calcularBalanceteCompetencia(competencia || '', {}),
      seloCalculado: null,
      seloGravado: null,
      integro: null
    };
  }

  const todosLancamentos = normalizarListaLancamentos(lancamentos);
  const mapaLancPorId = new Map(todosLancamentos.map(l => [String(l.id), l]));
  const lancsCompetencia = todosLancamentos.filter(
    l => (l.competencia || extrairCompetencia(l.data)) === competencia
  );

  // 1. Verifica cada lançamento da competência (lançamento inválido)
  for (const l of lancsCompetencia) {
    const deb = String(l.contaDebito || '').trim();
    const cred = String(l.contaCredito || '').trim();
    const temCents = l.valorCents !== undefined && l.valorCents !== null;
    const valCents = temCents ? Number(l.valorCents) : toCents(l.valor);
    const valReaisCents = l.valor !== undefined && l.valor !== null ? toCents(l.valor) : valCents;

    if (!deb || !cred) {
      bloqueios.push({
        codigo: 'lancamento_invalido',
        lancamentoId: l.id,
        mensagem: `Lançamento ${l.id} inválido: contaDebito ou contaCredito ausente.`
      });
      continue;
    }
    if (deb === cred) {
      bloqueios.push({
        codigo: 'lancamento_invalido',
        lancamentoId: l.id,
        mensagem: `Lançamento ${l.id} inválido: contaDebito e contaCredito são idênticas (${deb}).`
      });
    }
    if (!Number.isFinite(valCents) || !Number.isInteger(valCents) || valCents <= 0) {
      bloqueios.push({
        codigo: 'lancamento_invalido',
        lancamentoId: l.id,
        mensagem: `Lançamento ${l.id} inválido: valor em centavos (${valCents}) deve ser inteiro positivo.`
      });
    } else if (Math.abs(valCents - valReaisCents) > 0) {
      bloqueios.push({
        codigo: 'lancamento_invalido',
        lancamentoId: l.id,
        mensagem: `Lançamento ${l.id} inválido: divergência entre valor (${l.valor}) e valorCents (${valCents}).`
      });
    }
    if (l.imutavel === false) {
      bloqueios.push({
        codigo: 'lancamento_invalido',
        lancamentoId: l.id,
        mensagem: `Lançamento ${l.id} inválido: flag imutavel foi desmarcada.`
      });
    }
  }

  // 2. Calcula balancete e verifica se está balanceado
  const balancete = calcularBalanceteCompetencia(competencia, lancamentos);
  if (!balancete.balanceado) {
    bloqueios.push({
      codigo: 'balancete_desbalanceado',
      diferencaCents: balancete.diferencaCents,
      mensagem: `Balancete desbalanceado na competência ${competencia}: débitos (${balancete.totalDebitos.toFixed(2)}) ≠ créditos (${balancete.totalCreditos.toFixed(2)}).`
    });
  }

  // 3. Verifica repasses Pagos na competência sem lançamento correspondente no ledger
  const repassesEntries = Array.isArray(repasses)
    ? repasses.map((r, i) => [r.id || `rep_${i}`, r])
    : Object.entries(repasses || {});

  for (const [repKey, rep] of repassesEntries) {
    if (!rep || typeof rep !== 'object') continue;
    const repId = String(rep.id || repKey);
    const compPago =
      extrairCompetencia(rep.pagoEm || '') ||
      extrairCompetencia(rep.decididoEm || '') ||
      extrairCompetencia(rep.solicitadoEm || '');

    if (rep.status === 'Pago' && compPago === competencia) {
      const lncPrincipal =
        mapaLancPorId.get(`lnc_rep_${repId}`) ||
        lancsCompetencia.find(
          l => String(l.origemId) === repId && l.tipo !== 'estorno' && !String(l.id).startsWith('lnc_tar_')
        );

      const esperadoLiquidoCents = toCents(
        rep.valorLiquido !== undefined ? rep.valorLiquido : rep.valorSolicitado
      );

      if (!lncPrincipal) {
        bloqueios.push({
          codigo: 'repasse_pago_sem_lancamento',
          repasseId: repId,
          mensagem: `Repasse ${repId} consta como Pago na competência ${competencia}, mas não possui lançamento de liquidação no Ledger.`
        });
      } else {
        const compLanc = lncPrincipal.competencia || extrairCompetencia(lncPrincipal.data);
        const lancCents =
          lncPrincipal.valorCents !== undefined ? Number(lncPrincipal.valorCents) : toCents(lncPrincipal.valor);
        if (compLanc !== competencia || lancCents !== esperadoLiquidoCents) {
          bloqueios.push({
            codigo: 'repasse_pago_sem_lancamento',
            repasseId: repId,
            mensagem: `Repasse ${repId} possui lançamento ${lncPrincipal.id} com valor ou competência divergente (${compLanc}, ${lancCents} cents vs esperado ${esperadoLiquidoCents} cents).`
          });
        }
      }
    }
  }

  // 4. Verifica devoluções (repasses Estornados que eram Pagos + lançamentos de estorno sem contrapartida válida)
  const estornosEntries = Array.isArray(estornos)
    ? estornos.map((e, i) => [e.id || `est_${i}`, e])
    : Object.entries(estornos || {});
  const mapaEstornosPorRepasse = new Map();
  for (const [, est] of estornosEntries) {
    if (est && est.repasseId) {
      mapaEstornosPorRepasse.set(String(est.repasseId), est);
    }
  }

  for (const [repKey, rep] of repassesEntries) {
    if (!rep || typeof rep !== 'object' || rep.status !== 'Estornado') continue;
    const repId = String(rep.id || repKey);
    const regEstorno = mapaEstornosPorRepasse.get(repId);
    const eraPago =
      (regEstorno && regEstorno.statusAnterior === 'Pago') ||
      Boolean(rep.pagoEm || rep.protocoloDevolucao || mapaLancPorId.get(`lnc_rep_${repId}`));

    if (!eraPago) continue;

    const compEstorno =
      extrairCompetencia((regEstorno && regEstorno.estornadoEm) || rep.estornadoEm || '') ||
      extrairCompetencia(rep.pagoEm || '');

    if (compEstorno === competencia) {
      const lncEst =
        mapaLancPorId.get(`lnc_est_rep_${repId}`) ||
        lancsCompetencia.find(l => String(l.origemId) === repId && (l.tipo === 'estorno' || Boolean(l.estornoDeId)));

      if (!lncEst) {
        bloqueios.push({
          codigo: 'devolucao_sem_contrapartida',
          repasseId: repId,
          mensagem: `Repasse ${repId} (Pago -> Estornado) na competência ${competencia} não possui lançamento de contrapartida (devolução) no Ledger.`
        });
      }
    }
  }

  for (const l of lancsCompetencia) {
    const ehEstorno = l.tipo === 'estorno' || Boolean(l.estornoDeId);
    if (!ehEstorno) continue;

    if (!l.estornoDeId) {
      bloqueios.push({
        codigo: 'devolucao_sem_contrapartida',
        lancamentoId: l.id,
        mensagem: `Lançamento de estorno ${l.id} não referencia estornoDeId.`
      });
      continue;
    }

    const orig = mapaLancPorId.get(String(l.estornoDeId));
    if (!orig) {
      bloqueios.push({
        codigo: 'devolucao_sem_contrapartida',
        lancamentoId: l.id,
        estornoDeId: l.estornoDeId,
        mensagem: `Lançamento de estorno ${l.id} aponta para lançamento original inexistente (${l.estornoDeId}).`
      });
      continue;
    }

    const origCents = orig.valorCents !== undefined ? Number(orig.valorCents) : toCents(orig.valor);
    const estCents = l.valorCents !== undefined ? Number(l.valorCents) : toCents(l.valor);
    const contasInvertidas =
      String(l.contaDebito).trim() === String(orig.contaCredito).trim() &&
      String(l.contaCredito).trim() === String(orig.contaDebito).trim();

    if (origCents !== estCents || !contasInvertidas) {
      bloqueios.push({
        codigo: 'devolucao_sem_contrapartida',
        lancamentoId: l.id,
        estornoDeId: l.estornoDeId,
        mensagem: `Lançamento de estorno ${l.id} não inverte exatamente as contas/valores do lançamento original ${l.estornoDeId}.`
      });
    }
  }

  // 5. Selo SHA-256 e verificação de integridade caso a competência já esteja fechada
  const seloCalculado = calcularSeloFechamento(competencia, lancamentos);
  const fechAtual = (fechamentos || {})[competencia] || null;
  const jaFechado = Boolean(fechAtual && fechAtual.fechado === true);
  const emFechamento = Boolean(fechAtual && (fechAtual.emFechamento === true || fechAtual.status === 'Fechando'));

  let integro = null;
  const seloGravado = fechAtual && fechAtual.seloSha256 ? String(fechAtual.seloSha256) : null;

  if (jaFechado) {
    if (seloGravado) {
      integro = seloGravado === seloCalculado;
      if (!integro) {
        bloqueios.push({
          codigo: 'adulteracao_detectada',
          seloGravado,
          seloCalculado,
          mensagem: `Adulteração detectada na competência fechada ${competencia}: o selo SHA-256 calculado (${seloCalculado.slice(0, 12)}…) diverge do selo gravado (${seloGravado.slice(0, 12)}…).`
        });
      }
    } else {
      avisos.push({
        codigo: 'fechamento_sem_selo',
        mensagem: `A competência ${competencia} foi fechada manualmente sem selo SHA-256. Reabra e feche novamente para selar.`
      });
    }
  } else {
    // Se não está fechado, valida sequência e mês em curso/futuro
    const seq = verificarSequenciaFechamento(competencia, {
      lancamentos,
      fechamentos,
      competenciaAtual
    });
    bloqueios.push(...seq.bloqueios);

    if (emFechamento && !ignorarTravaPropria) {
      bloqueios.push({
        codigo: 'em_fechamento',
        mensagem: `A competência ${competencia} já está sendo fechada por outro operador no momento.`
      });
    }
  }

  if (lancsCompetencia.length === 0) {
    avisos.push({
      codigo: 'competencia_sem_lancamentos',
      mensagem: `A competência ${competencia} não possui lançamentos registrados no Ledger.`
    });
  }

  return {
    competencia,
    statusAtual: jaFechado ? 'Fechado' : emFechamento ? 'Fechando' : (fechAtual && fechAtual.status) || 'Aberto',
    fechado: jaFechado,
    emFechamento,
    versao: (fechAtual && Number(fechAtual.versao)) || 0,
    seloCalculado,
    seloGravado,
    integro,
    aptoParaFechar: !jaFechado && bloqueios.length === 0,
    bloqueios,
    avisos,
    balancete
  };
}

/**
 * Valida se uma competência pode ser reaberta:
 * - Deve estar atualmente fechada;
 * - Deve ser a ÚLTIMA competência fechada (não pode reabrir jan se fev está fechado);
 * - Exige motivo preenchido;
 * - Exige segregação de funções: quem fechou não pode reabrir (salvo FECHAMENTO_SEGREGACAO=false em dev).
 */
function verificarPermissaoReabertura(
  competencia,
  { fechamentos = {}, motivo = '', usuario = '', uid = '', segregacaoAtiva = true } = {}
) {
  if (!validarFormatoCompetencia(competencia)) {
    return {
      permitido: false,
      codigoErro: 'invalid-argument',
      mensagem: 'Informe a competência no formato YYYY-MM.'
    };
  }

  const motivoLimpo = String(motivo || '').trim();
  if (motivoLimpo.length < 5) {
    return {
      permitido: false,
      codigoErro: 'invalid-argument',
      mensagem: 'Informe obrigatoriamente o motivo da reabertura (mínimo 5 caracteres).'
    };
  }

  const fechAtual = (fechamentos || {})[competencia];
  if (!fechAtual || fechAtual.fechado !== true) {
    return {
      permitido: false,
      codigoErro: 'failed-precondition',
      mensagem: `A competência ${competencia} não se encontra fechada.`
    };
  }

  // Verifica se existe alguma competência posterior fechada
  const posterioresFechadas = Object.entries(fechamentos || {})
    .filter(([k, f]) => {
      const comp = (f && f.competencia) || k;
      return validarFormatoCompetencia(comp) && comp > competencia && f && f.fechado === true;
    })
    .map(([k, f]) => (f && f.competencia) || k)
    .sort();

  if (posterioresFechadas.length > 0) {
    return {
      permitido: false,
      codigoErro: 'failed-precondition',
      mensagem: `Só é permitido reabrir a última competência fechada. A(s) competência(s) posterior(es) (${posterioresFechadas.join(', ')}) está(ão) fechada(s).`
    };
  }

  if (segregacaoAtiva) {
    const fechadoPorEmail = String(fechAtual.fechadoPor || '').trim();
    const fechadoPorUid = String(fechAtual.fechadoPorUid || '').trim();
    const mesmoUsuario =
      (uid && fechadoPorUid && uid === fechadoPorUid) ||
      (usuario && fechadoPorEmail && usuario === fechadoPorEmail) ||
      (uid && fechadoPorEmail && uid === fechadoPorEmail);

    if (mesmoUsuario) {
      return {
        permitido: false,
        codigoErro: 'failed-precondition',
        mensagem: `Segregação de funções: o operador (${usuario || uid}) que fechou a competência ${competencia} não pode reabri-la.`
      };
    }
  }

  return {
    permitido: true,
    codigoErro: null,
    mensagem: null
  };
}

/**
 * Lista todas as competências relevantes (do primeiro mês com lançamento/fechamento até a competência atual)
 * para exibição no painel de Fechamento Mensal.
 */
function listarCompetenciasOrdenadas({
  lancamentos = {},
  fechamentos = {},
  competenciaAtual = obterCompetenciaAtualBR()
} = {}) {
  const conj = new Set();
  for (const l of normalizarListaLancamentos(lancamentos)) {
    const c = l.competencia || extrairCompetencia(l.data);
    if (validarFormatoCompetencia(c)) conj.add(c);
  }
  for (const [k, f] of Object.entries(fechamentos || {})) {
    const c = (f && f.competencia) || k;
    if (validarFormatoCompetencia(c)) conj.add(c);
  }
  if (validarFormatoCompetencia(competenciaAtual)) {
    conj.add(competenciaAtual);
    const ant = competenciaAnterior(competenciaAtual);
    if (ant) conj.add(ant);
  }

  const ordenadas = Array.from(conj).sort();
  if (ordenadas.length <= 1) return ordenadas;

  const inicio = ordenadas[0];
  const fim = ordenadas[ordenadas.length - 1];
  const resultado = [];
  let cursor = inicio;
  let guard = 0;
  while (cursor && cursor <= fim && guard < 240) {
    resultado.push(cursor);
    cursor = competenciaSeguinte(cursor);
    guard += 1;
  }
  return resultado;
}

module.exports = {
  PLANO_CONTAS,
  obterDataAtualBR,
  obterCompetenciaAtualBR,
  extrairCompetencia,
  validarFormatoCompetencia,
  competenciaAnterior,
  competenciaSeguinte,
  competenciaEstaFechada,
  criarLancamentoPartidaDobrada,
  gerarEstornoLancamento,
  calcularSeloFechamento,
  calcularBalanceteCompetencia,
  verificarSequenciaFechamento,
  calcularPreviaFechamento,
  verificarPermissaoReabertura,
  listarCompetenciasOrdenadas
};
