/**
 * Domínio Puro (em centavos) — Módulo Contratos, Negociações e Aditivos Versionados (comercial/contratos)
 * - Valida parâmetros comerciais (/negociacoes) e regras financeiras de borderô (/eventos_fin)
 * - Impõe faixas de liberação crescentes, limites de percentuais (0..100%) e motivo obrigatório em aditivos (v2+)
 * - Gera versão sequencial imutável com selo SHA-256 dos termos e projeção limpa para o produtor (sem taxas Disk)
 */
'use strict';

const crypto = require('node:crypto');

function toCents(v) {
  return Math.round((Number(v || 0) + Number.EPSILON) * 100);
}

function fromCents(c) {
  return Math.round(Number(c || 0)) / 100;
}

function round2(v) {
  return fromCents(toCents(v));
}

function calcularContratos(registro = {}) {
  const valorBaseCents = toCents(registro.valorBase || registro.valor || registro.garantiaMinima || 0);
  const abatimentoCents = toCents(registro.abatimento || 0);
  const liquidoCents = Math.max(0, valorBaseCents - abatimentoCents);

  return {
    id: registro.id || null,
    produtoraId: registro.produtoraId || null,
    eventoId: registro.eventoId || null,
    numeroContrato: registro.numeroContrato || null,
    valorBaseCents,
    valorBase: fromCents(valorBaseCents),
    abatimentoCents,
    abatimento: fromCents(abatimentoCents),
    valorLiquidoCents: liquidoCents,
    valorLiquido: fromCents(liquidoCents),
    vigenciaInicio: registro.vigenciaInicio || null,
    vigenciaFim: registro.vigenciaFim || null,
    status: registro.status || 'Pendente'
  };
}

function validarVigenciaContrato(contrato = {}, dataRefISO = '2026-10-26') {
  const assinado = Boolean(contrato.assinadoProdutor && contrato.assinadoComercial);
  const inicio = String(contrato.vigenciaInicio || '');
  const fim = String(contrato.vigenciaFim || '');
  const dentroPrazo = (!inicio || dataRefISO >= inicio) && (!fim || dataRefISO <= fim);
  const vigente = assinado && dentroPrazo && contrato.status !== 'Rescindido';

  return {
    id: contrato.id || null,
    produtoraId: contrato.produtoraId || null,
    assinado,
    dentroPrazo,
    vigente,
    statusCalculado:
      contrato.status === 'Rescindido'
        ? 'Rescindido'
        : vigente
        ? 'Vigente'
        : !dentroPrazo && fim && dataRefISO > fim
        ? 'Expirado'
        : 'AguardandoAssinatura'
  };
}

function validarFaixasLiberacao(faixas = []) {
  if (!Array.isArray(faixas) || faixas.length === 0) {
    throw new Error('A regra de liberação deve possuir ao menos uma faixa de capacidade.');
  }
  const normalizadas = [];
  let ultimoGatilho = 0;
  let ultimoLibera = 0;

  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i] || {};
    const gatilhoPct = round2(f.gatilhoPct);
    const liberaPct = round2(f.liberaPct);
    if (gatilhoPct <= 0 || gatilhoPct > 100) {
      throw new Error(`Faixa #${i + 1}: gatilhoPct (${gatilhoPct}%) deve estar entre 0,01% e 100%.`);
    }
    if (liberaPct < 0 || liberaPct > 100) {
      throw new Error(`Faixa #${i + 1}: liberaPct (${liberaPct}%) deve estar entre 0% e 100%.`);
    }
    if (gatilhoPct <= ultimoGatilho) {
      throw new Error(
        `As faixas de liberação devem ter gatilhoPct estritamente crescente (faixa #${i + 1}: ${gatilhoPct}% <= ${ultimoGatilho}%).`
      );
    }
    if (liberaPct < ultimoLibera) {
      throw new Error(
        `As faixas de liberação não podem reduzir o percentual liberado em gatilhos maiores (faixa #${i + 1}: ${liberaPct}% < ${ultimoLibera}%).`
      );
    }
    ultimoGatilho = gatilhoPct;
    ultimoLibera = liberaPct;
    normalizadas.push({ gatilhoPct, liberaPct });
  }

  return normalizadas;
}

function validarTermosComerciaisEvento(dados = {}, contexto = {}) {
  const { eventoExistente = null, contratoExistente = null } = contexto;
  const eventoId = String(dados.eventoId || '').trim();
  if (!eventoId) {
    throw new Error('O identificador do evento (eventoId) é obrigatório.');
  }
  if (!eventoExistente) {
    throw new Error(`Evento "${eventoId}" não encontrado no cadastro mestre.`);
  }
  if (eventoExistente.ativo === false) {
    throw new Error(`Não é permitido publicar contrato/negociação para o evento inativo "${eventoId}".`);
  }

  const produtoraId = String(eventoExistente.produtoraId || dados.produtoraId || '').trim();
  if (!produtoraId) {
    throw new Error(`O evento "${eventoId}" não possui produtoraId vinculada.`);
  }

  const versaoAnterior = Number((contratoExistente && contratoExistente.versao) || 0);
  const ehAditivo = versaoAnterior >= 1;
  const motivoAditivo = String(dados.motivoAditivo || '').trim();

  if (ehAditivo && motivoAditivo.length < 5) {
    throw new Error(
      `Para publicar aditivo (versão ${versaoAnterior + 1}) sobre contrato existente, informe obrigatoriamente o motivoAditivo (mínimo 5 caracteres).`
    );
  }

  const negIn = dados.negociacao || {};
  const tipoTaxaOp = negIn.taxaOp && negIn.taxaOp.tipo === 'porIngresso' ? 'porIngresso' : 'percentual';
  const valorTaxaOp = round2((negIn.taxaOp && negIn.taxaOp.valor) || 0);
  if (valorTaxaOp < 0 || (tipoTaxaOp === 'percentual' && valorTaxaOp > 100)) {
    throw new Error(`Taxa operacional inválida (${valorTaxaOp}).`);
  }

  const convPct = round2((negIn.conveniencia && negIn.conveniencia.percentual) || 0);
  if (convPct < 0 || convPct > 100) {
    throw new Error(`Percentual de conveniência inválido (${convPct}%). Deve estar entre 0% e 100%.`);
  }

  const negociacao = {
    status: negIn.status === 'Suspensa' ? 'Suspensa' : 'Ativa',
    taxaOp: {
      tipo: tipoTaxaOp,
      valor: valorTaxaOp
    },
    conveniencia: {
      percentual: convPct
    },
    observacoes: String(negIn.observacoes || '').trim()
  };

  const finIn = dados.eventoFin || {};
  const taxaAdmPct = round2((finIn.taxaAdm && finIn.taxaAdm.percentual) || 0);
  if (taxaAdmPct < 0 || taxaAdmPct > 100) {
    throw new Error(`Percentual de taxa administrativa inválido (${taxaAdmPct}%). Deve estar entre 0% e 100%.`);
  }

  const rebateIn = finIn.rebate || {};
  const tipoRebate = rebateIn.tipo === 'porIngresso' ? 'porIngresso' : 'percentual';
  const valorRebate = round2(rebateIn.valor || 0);
  if (valorRebate < 0 || (tipoRebate === 'percentual' && valorRebate > 100)) {
    throw new Error(`Valor de rebate inválido (${valorRebate}).`);
  }

  const patIn = finIn.patrocinioEvento || {};
  const valorPatEv = round2(patIn.valor || 0);
  if (valorPatEv < 0) {
    throw new Error('O valor de patrocínio do evento não pode ser negativo.');
  }

  const regraIn = finIn.regra || {};
  const modoRegra = ['MIN', 'MAX', 'FAIXAS'].includes(regraIn.modo) ? regraIn.modo : 'MIN';
  const pctResultado = round2(regraIn.pctResultado !== undefined ? regraIn.pctResultado : 60);
  if (pctResultado < 0 || pctResultado > 100) {
    throw new Error(`pctResultado inválido (${pctResultado}%). Deve estar entre 0% e 100%.`);
  }
  const reservaReembolsoPct = round2(regraIn.reservaReembolsoPct || 0);
  if (reservaReembolsoPct < 0 || reservaReembolsoPct >= 100) {
    throw new Error(`reservaReembolsoPct inválido (${reservaReembolsoPct}%). Deve estar entre 0% e 99,99%.`);
  }

  const faixasPadrao = [
    { gatilhoPct: 30, liberaPct: 20 },
    { gatilhoPct: 50, liberaPct: 40 },
    { gatilhoPct: 80, liberaPct: 70 }
  ];
  const faixasValidadas = validarFaixasLiberacao(regraIn.faixas || faixasPadrao);

  const retencoes = Array.isArray(finIn.retencoes)
    ? finIn.retencoes.map((r, idx) => ({
        id: String(r.id || `ret_${idx + 1}`),
        nome: String(r.nome || `Retenção ${idx + 1}`),
        ativo: Boolean(r.ativo),
        tipo: ['percentual', 'fixo', 'unitario'].includes(r.tipo) ? r.tipo : 'percentual',
        base: r.base === 'liquido' ? 'liquido' : 'bruto',
        percentual: round2(r.percentual || 0),
        valorFixo: round2(r.valorFixo || 0),
        valorUnitario: round2(r.valorUnitario || 0),
        responsavel: r.responsavel === 'produtor' ? 'produtor' : 'disk',
        status: r.status === 'recolhido' ? 'recolhido' : 'provisionado'
      }))
    : [];

  const descontosOperacionais = Array.isArray(finIn.descontosOperacionais)
    ? finIn.descontosOperacionais.map((d, idx) => ({
        id: String(d.id || `desc_${idx + 1}`),
        nome: String(d.nome || `Desconto ${idx + 1}`),
        ativo: Boolean(d.ativo),
        quantidade: Math.max(0, Math.round(Number(d.quantidade || 0))),
        valorUnitario: round2(d.valorUnitario || 0)
      }))
    : [];

  const eventoFin = {
    taxaAdm: {
      ativo: finIn.taxaAdm ? Boolean(finIn.taxaAdm.ativo) : true,
      percentual: taxaAdmPct
    },
    retencoes,
    descontosOperacionais,
    rebate: {
      ativo: Boolean(rebateIn.ativo),
      tipo: tipoRebate,
      valor: valorRebate
    },
    patrocinioEvento: {
      ativo: Boolean(patIn.ativo),
      descricao: String(patIn.descricao || '').trim(),
      valor: valorPatEv
    },
    regra: {
      modo: modoRegra,
      pctResultado,
      reservaReembolsoPct,
      teto: Math.max(0, round2(regraIn.teto || 0)),
      liberaTotalDmais: Math.max(0, Math.round(Number(regraIn.liberaTotalDmais !== undefined ? regraIn.liberaTotalDmais : 2))),
      creditosSujeitosTrava: Boolean(regraIn.creditosSujeitosTrava),
      abaterDespesasAPagar: regraIn.abaterDespesasAPagar !== undefined ? Boolean(regraIn.abaterDespesasAPagar) : true,
      faixas: faixasValidadas
    }
  };

  const numeroContrato = String(dados.numeroContrato || (contratoExistente && contratoExistente.numeroContrato) || `CTR-${eventoId.toUpperCase()}`).trim();
  const vigenciaInicio = String(dados.vigenciaInicio || (contratoExistente && contratoExistente.vigenciaInicio) || '2026-01-01').trim();
  const vigenciaFim = String(dados.vigenciaFim || (contratoExistente && contratoExistente.vigenciaFim) || '2026-12-31').trim();

  return {
    eventoId,
    produtoraId,
    numeroContrato,
    vigenciaInicio,
    vigenciaFim,
    ehAditivo,
    versaoNova: versaoAnterior + 1,
    motivoAditivo: ehAditivo ? motivoAditivo : 'Emissão inicial do contrato comercial',
    negociacao,
    eventoFin
  };
}

function calcularHashTermosContrato(termosValidados) {
  const canonic = JSON.stringify({
    eventoId: termosValidados.eventoId,
    produtoraId: termosValidados.produtoraId,
    numeroContrato: termosValidados.numeroContrato,
    vigenciaInicio: termosValidados.vigenciaInicio,
    vigenciaFim: termosValidados.vigenciaFim,
    negociacao: termosValidados.negociacao,
    eventoFin: termosValidados.eventoFin
  });
  return crypto.createHash('sha256').update(canonic).digest('hex');
}

function gerarVersaoContratoAditivo({ termosValidados, contratoExistente = null, usuario = 'sistema', dataHora = '' }) {
  const hashTermosSha256 = calcularHashTermosContrato(termosValidados);
  const versao = termosValidados.versaoNova;
  const chaveVersao = `v${versao}`;
  const historicoAnterior = (contratoExistente && contratoExistente.historico) || {};

  const entradaHistorico = {
    versao,
    numeroContrato: termosValidados.numeroContrato,
    motivoAditivo: termosValidados.motivoAditivo,
    hashTermosSha256,
    publicadoPor: usuario,
    publicadoEm: dataHora,
    snapshotNegociacao: termosValidados.negociacao,
    snapshotEventoFin: termosValidados.eventoFin
  };

  const contratoCompleto = {
    id: termosValidados.eventoId,
    eventoId: termosValidados.eventoId,
    produtoraId: termosValidados.produtoraId,
    numeroContrato: termosValidados.numeroContrato,
    versao,
    status: 'Vigente',
    vigenciaInicio: termosValidados.vigenciaInicio,
    vigenciaFim: termosValidados.vigenciaFim,
    assinadoComercial: true,
    assinadoProdutor: true,
    hashTermosSha256,
    ultimoMotivoAditivo: termosValidados.motivoAditivo,
    atualizadoPor: usuario,
    atualizadoEm: dataHora,
    historico: {
      ...historicoAnterior,
      [chaveVersao]: entradaHistorico
    }
  };

  // Projeção limpa para o produtor (NUNCA inclui taxas internas da Disk)
  const resumoProdutor = {
    id: termosValidados.eventoId,
    eventoId: termosValidados.eventoId,
    produtoraId: termosValidados.produtoraId,
    numeroContrato: termosValidados.numeroContrato,
    versao,
    status: 'Vigente',
    vigenciaInicio: termosValidados.vigenciaInicio,
    vigenciaFim: termosValidados.vigenciaFim,
    hashTermosSha256,
    regraLiberacao: {
      modo: termosValidados.eventoFin.regra.modo,
      pctResultado: termosValidados.eventoFin.regra.pctResultado,
      liberaTotalDmais: termosValidados.eventoFin.regra.liberaTotalDmais,
      faixas: termosValidados.eventoFin.regra.faixas
    },
    patrocinioEvento: termosValidados.eventoFin.patrocinioEvento,
    ultimoMotivoAditivo: termosValidados.motivoAditivo,
    atualizadoEm: dataHora
  };

  return {
    versao,
    hashTermosSha256,
    contratoCompleto,
    resumoProdutor,
    entradaHistorico
  };
}

module.exports = {
  calcularContratos,
  validarVigenciaContrato,
  validarFaixasLiberacao,
  validarTermosComerciaisEvento,
  calcularHashTermosContrato,
  gerarVersaoContratoAditivo
};
