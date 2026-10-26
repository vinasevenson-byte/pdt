/**
 * Hub de Repasses DiskIngressos — Motor de Cálculo Puro (PROMPT 2)
 * Funções puras (sem Firebase, sem DOM), compartilhadas entre Backend (Cloud Functions)
 * e a tela do Financeiro (financeiro.html).
 * IMPORTANTE: Este arquivo NUNCA é importado no front do Produtor (produtor.html).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MotorRepasse = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function toNum(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const s = String(v == null ? '' : v).trim().replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function toCents(valorReais) {
    return Math.round((toNum(valorReais) + Number.EPSILON) * 100);
  }

  function fromCents(valorCents) {
    return Math.round(Number(valorCents || 0)) / 100;
  }

  function round2(n) {
    return fromCents(toCents(n));
  }

  function addMoney(...valoresReais) {
    return fromCents(valoresReais.reduce((acc, v) => acc + toCents(v), 0));
  }

  function subMoney(aReais, bReais) {
    return fromCents(toCents(aReais) - toCents(bReais));
  }

  function mulPct(valorReais, percentual) {
    const cents = toCents(valorReais);
    const pct = toNum(percentual);
    return fromCents(Math.round((cents * pct) / 100));
  }

  /**
   * Utilitários de Calendário Bancário Brasileiro (segunda a sexta, descontando feriados nacionais)
   */
  function parseDataBR(dataStr) {
    if (!dataStr || typeof dataStr !== 'string') return null;
    const limpo = dataStr.trim();
    const mBR = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(limpo);
    if (mBR) {
      const dia = parseInt(mBR[1], 10);
      const mes = parseInt(mBR[2], 10) - 1;
      const ano = parseInt(mBR[3], 10);
      return new Date(Date.UTC(ano, mes, dia, 12, 0, 0));
    }
    const mISO = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpo);
    if (mISO) {
      const ano = parseInt(mISO[1], 10);
      const mes = parseInt(mISO[2], 10) - 1;
      const dia = parseInt(mISO[3], 10);
      return new Date(Date.UTC(ano, mes, dia, 12, 0, 0));
    }
    return null;
  }

  function formatarDataBR(dateUTC) {
    if (!(dateUTC instanceof Date) || isNaN(dateUTC.getTime())) return '';
    const d = String(dateUTC.getUTCDate()).padStart(2, '0');
    const m = String(dateUTC.getUTCMonth() + 1).padStart(2, '0');
    const y = dateUTC.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }

  function calcularPascoaUTC(ano) {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(ano, mes, dia, 12, 0, 0));
  }

  function obterFeriadosNacionaisSet(ano) {
    const fixos = [
      `01/01/${ano}`, // Confraternização Universal
      `21/04/${ano}`, // Tiradentes
      `01/05/${ano}`, // Dia do Trabalho
      `07/09/${ano}`, // Independência do Brasil
      `12/10/${ano}`, // Nossa Senhora Aparecida
      `02/11/${ano}`, // Finados
      `15/11/${ano}`, // Proclamação da República
      `20/11/${ano}`, // Dia Nacional de Zumbi e da Consciência Negra
      `25/12/${ano}`  // Natal
    ];
    const pascoa = calcularPascoaUTC(ano);
    const addDias = (dt, dias) => {
      const copia = new Date(dt.getTime());
      copia.setUTCDate(copia.getUTCDate() + dias);
      return formatarDataBR(copia);
    };
    // Feriados bancários móveis (FEBRABAN): Segunda e Terça de Carnaval, Sexta-feira da Paixão e Corpus Christi
    fixos.push(addDias(pascoa, -48)); // Segunda de Carnaval
    fixos.push(addDias(pascoa, -47)); // Terça de Carnaval
    fixos.push(addDias(pascoa, -2));  // Sexta-feira Santa
    fixos.push(addDias(pascoa, 60));  // Corpus Christi
    return new Set(fixos);
  }

  function ehDiaUtilBancario(dateUTC) {
    if (!(dateUTC instanceof Date) || isNaN(dateUTC.getTime())) return false;
    const dow = dateUTC.getUTCDay();
    if (dow === 0 || dow === 6) return false; // Domingo ou Sábado
    const feriados = obterFeriadosNacionaisSet(dateUTC.getUTCFullYear());
    return !feriados.has(formatarDataBR(dateUTC));
  }

  function somarDiasUteis(dataStr, diasUteis = 2) {
    const dt = parseDataBR(dataStr);
    if (!dt) return '';
    const qtd = Math.max(0, Math.floor(toNum(diasUteis)));
    const cursor = new Date(dt.getTime());
    let contados = 0;
    while (contados < qtd) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (ehDiaUtilBancario(cursor)) {
        contados++;
      }
    }
    // Se qtd === 0 e cair em fim de semana/feriado, avança para o próximo dia útil
    if (qtd === 0 && !ehDiaUtilBancario(cursor)) {
      while (!ehDiaUtilBancario(cursor)) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return formatarDataBR(cursor);
  }

  function calcularDataLiberacaoPosEvento(dataEventoStr, liberaTotalDmais = 2, dataReferenciaStr = null) {
    const diasUteis = Math.max(0, Math.floor(toNum(liberaTotalDmais)));
    const dataLiberacaoTotal = somarDiasUteis(dataEventoStr, diasUteis);
    const dtLiberacao = parseDataBR(dataLiberacaoTotal);
    const dtRef = dataReferenciaStr ? parseDataBR(dataReferenciaStr) : null;
    const liberadoPosEvento = Boolean(dtLiberacao && dtRef && dtRef.getTime() >= dtLiberacao.getTime());
    return {
      diasUteis,
      dataLiberacaoTotal,
      liberadoPosEvento
    };
  }

  /**
   * Cálculo de Tarifa de Transferência (PIX gratuito R$ 0,00 | TED configurável no Financeiro, padrão R$ 10,00)
   */
  function calcTransferencia(valorSolicitado, forma = 'PIX', configTransferencia = {}) {
    const formaNorm = String(forma || 'PIX').toUpperCase() === 'TED' ? 'TED' : 'PIX';
    const valorBruto = round2(Math.max(0, toNum(valorSolicitado)));
    const tarifaPix = round2(Math.max(0, toNum(configTransferencia && configTransferencia.pixValor !== undefined ? configTransferencia.pixValor : 0)));
    const tarifaTed = round2(Math.max(0, toNum(configTransferencia && configTransferencia.tedValor !== undefined ? configTransferencia.tedValor : 10)));
    const tarifa = valorBruto > 0 ? (formaNorm === 'TED' ? tarifaTed : tarifaPix) : 0;
    const valorLiquido = round2(Math.max(0, valorBruto - tarifa));
    return {
      forma: formaNorm,
      valorBruto,
      tarifa,
      tarifaPix,
      tarifaTed,
      valorLiquido
    };
  }

  /**
   * 1. capacidadeUsada(evento, local)
   * - modo "local"   → local.capacidadeTotal
   * - modo "setores" → soma da capacidade dos setores em capacidade.setoresAbertos
   * - modo "manual"  → capacidade.manual
   * ingressosContados = vendidos + (contarCortesias ? cortesias : 0)
   * pctVendido = ingressosContados / capacidadeUsada × 100
   */
  function capacidadeUsada(evento = {}, local = {}) {
    const capCfg = evento.capacidade || {};
    const modo = capCfg.modo || 'local';
    let cap = 0;

    if (modo === 'manual') {
      cap = toNum(capCfg.manual);
    } else if (modo === 'setores') {
      const abertos = Array.isArray(capCfg.setoresAbertos) ? capCfg.setoresAbertos : [];
      const setoresLocal = Array.isArray(local.setores) ? local.setores : [];
      cap = setoresLocal
        .filter(s => abertos.includes(s.nome))
        .reduce((acc, s) => acc + toNum(s.capacidade), 0);
    } else {
      cap = toNum(local.capacidadeTotal || capCfg.manual || 0);
    }

    const vendas = evento.vendas || {};
    const vendidos = toNum(vendas.vendidos);
    const cortesias = toNum(vendas.cortesias);
    const contarCortesias = Boolean(capCfg.contarCortesias);
    const ingressosContados = vendidos + (contarCortesias ? cortesias : 0);
    const pctVendido = cap > 0 ? (ingressosContados / cap) * 100 : 0;

    return {
      capacidadeUsada: cap,
      vendidos,
      cortesias,
      contarCortesias,
      ingressosContados,
      pctVendido
    };
  }

  /**
   * 2. calcEvento(evento, fin, negociacao, despesasLancadas, advancedEvento, antecipacoesEvento, local)
   */
  function calcEvento(
    evento = {},
    fin = {},
    negociacao = {},
    despesasLancadas = [],
    advancedEvento = [],
    antecipacoesEvento = [],
    local = {}
  ) {
    const capInfo = capacidadeUsada(evento, local);
    const cap = capInfo.capacidadeUsada;
    const vendidos = capInfo.vendidos;
    const ingressosContados = capInfo.ingressosContados;
    const pctVendido = capInfo.pctVendido;

    // Bilheteria das vendas de ingressos (SEM conveniência) — aritmética unificada em centavos inteiros
    const bilCents = toCents(evento.bilheteria);
    const bil = fromCents(bilCents);

    // TAXAS DISK
    const taxaAdmCfg = fin.taxaAdm || { ativo: false, percentual: 0 };
    const taxaAdm = taxaAdmCfg.ativo ? mulPct(bil, taxaAdmCfg.percentual) : 0;

    const taxaOpCfg = (negociacao && negociacao.taxaOp) || { tipo: 'fixo', valor: 0 };
    const valOp = toNum(taxaOpCfg.valor);
    let taxaOp = 0;
    if (taxaOpCfg.tipo === 'porIngresso') {
      taxaOp = fromCents(Math.round(vendidos * toCents(valOp)));
    } else if (taxaOpCfg.tipo === 'percentual') {
      taxaOp = mulPct(bil, valOp);
    } else {
      taxaOp = round2(valOp);
    }

    // RETENÇÕES (para cada item)
    const retencoesRaw = Array.isArray(fin.retencoes) ? fin.retencoes : [];
    const retencoesDetalhe = retencoesRaw.map(r => {
      const ativo = Boolean(r.ativo);
      const baseRet = r.base === 'liquido' ? addMoney(bil, -taxaAdm, -taxaOp) : bil;
      let valorCalculado = 0;

      if (r.tipo === 'percentual') {
        valorCalculado = mulPct(baseRet, r.percentual);
      } else if (r.tipo === 'fixo') {
        valorCalculado = round2(r.valorFixo);
      } else if (r.tipo === 'maiorEntre') {
        valorCalculado = Math.max(round2(r.valorFixo), mulPct(baseRet, r.percentual));
      } else if (r.tipo === 'porIngresso') {
        valorCalculado = fromCents(Math.round(vendidos * toCents(r.valorUnitario)));
      } else if (r.tipo === 'porCapacidade') {
        valorCalculado = fromCents(Math.round(cap * toCents(r.valorUnitario)));
      }

      valorCalculado = round2(valorCalculado);
      const responsavel = r.responsavel || 'disk';
      const status = r.status || 'provisionado';

      // Desconta do repasse SOMENTE se ativo && responsavel=="disk" && status=="provisionado"
      const descontaDoRepasse = ativo && responsavel === 'disk' && status === 'provisionado';

      return {
        id: r.id,
        nome: r.nome,
        ativo,
        tipo: r.tipo,
        base: r.base || 'bruto',
        percentual: toNum(r.percentual),
        valorFixo: toNum(r.valorFixo),
        valorUnitario: toNum(r.valorUnitario),
        responsavel,
        status,
        valorCalculado,
        valor: descontaDoRepasse ? valorCalculado : 0,
        descontaDoRepasse
      };
    });

    const totRetencoes = fromCents(
      retencoesDetalhe.reduce((acc, item) => acc + toCents(item.valor), 0)
    );

    // DESCONTOS OPERACIONAIS
    const descontosRaw = Array.isArray(fin.descontosOperacionais) ? fin.descontosOperacionais : [];
    const descontosDetalhe = descontosRaw.map(d => {
      const ativo = Boolean(d.ativo);
      const qtd = toNum(d.quantidade);
      const unit = toNum(d.valorUnitario);
      const valor = ativo ? fromCents(Math.round(qtd * toCents(unit))) : 0;
      return {
        id: d.id,
        nome: d.nome,
        ativo,
        quantidade: qtd,
        valorUnitario: unit,
        valor
      };
    });

    const totOps = fromCents(
      descontosDetalhe.reduce((acc, item) => acc + toCents(item.valor), 0)
    );

    const regra = fin.regra || {
      modo: 'MIN',
      pctResultado: 60,
      reservaReembolsoPct: 0,
      teto: 0,
      liberaTotalDmais: 2,
      creditosSujeitosTrava: false,
      abaterDespesasAPagar: true,
      faixas: [
        { gatilhoPct: 30, liberaPct: 20 },
        { gatilhoPct: 50, liberaPct: 40 },
        { gatilhoPct: 80, liberaPct: 70 }
      ]
    };

    // DESPESAS DO EVENTO
    // Por regra de negócio: abate TODAS as despesas lançadas (Pago + A pagar) por padrão,
    // a menos que a regra do evento especifique abaterDespesasAPagar: false.
    const abaterDespesasAPagar = regra.abaterDespesasAPagar !== false;
    let despesasPagasVal = 0;
    let despesasAPagarVal = 0;
    let despesas = 0;

    if (typeof despesasLancadas === 'number') {
      despesasPagasVal = round2(despesasLancadas);
      despesas = despesasPagasVal;
    } else if (Array.isArray(despesasLancadas)) {
      despesasPagasVal = fromCents(
        despesasLancadas
          .filter(d => !d.status || d.status === 'Pago')
          .reduce((acc, d) => acc + toCents(d.valor), 0)
      );
      despesasAPagarVal = fromCents(
        despesasLancadas
          .filter(d => d.status === 'A pagar')
          .reduce((acc, d) => acc + toCents(d.valor), 0)
      );
      despesas = addMoney(despesasPagasVal, abaterDespesasAPagar ? despesasAPagarVal : 0);
    }

    const reserva = mulPct(bil, regra.reservaReembolsoPct);

    // RESULTADO (em centavos inteiros)
    const resultado = addMoney(bil, -taxaAdm, -taxaOp, -despesas, -totRetencoes, -totOps, -reserva);

    // CRÉDITOS — SAEM DA TAXA ADM DO DISK (limitados a ela)
    const rebateCfg = fin.rebate || { ativo: false, tipo: 'percentual', valor: 0 };
    const rebateBruto = rebateCfg.ativo
      ? (rebateCfg.tipo === 'percentual' ? mulPct(bil, rebateCfg.valor) : round2(rebateCfg.valor))
      : 0;
    const rebate = fromCents(Math.min(toCents(rebateBruto), toCents(taxaAdm)));

    const patEvCfg = fin.patrocinioEvento || { ativo: false, descricao: '', valor: 0 };
    const patrocinioBruto = patEvCfg.ativo ? round2(patEvCfg.valor) : 0;
    const patrocinio = fromCents(Math.min(toCents(patrocinioBruto), Math.max(0, toCents(taxaAdm) - toCents(rebate))));

    const excedente = subMoney(addMoney(rebateBruto, patrocinioBruto), addMoney(rebate, patrocinio));
    const taxaAdmLiquida = addMoney(taxaAdm, -rebate, -patrocinio);
    const creditos = addMoney(rebate, patrocinio);

    // TRAVAS
    const creditosSujeitosTrava = Boolean(regra.creditosSujeitosTrava);
    const basePositiva = Math.max(0, addMoney(resultado, creditosSujeitosTrava ? creditos : 0));

    const pctResultado = toNum(regra.pctResultado);
    const A = mulPct(basePositiva, pctResultado);

    const faixasOrdenadas = (Array.isArray(regra.faixas) ? [...regra.faixas] : [])
      .map(f => ({
        gatilhoPct: toNum(f.gatilhoPct !== undefined ? f.gatilhoPct : f.gatilho),
        liberaPct: toNum(f.liberaPct !== undefined ? f.liberaPct : f.libera)
      }))
      .sort((a, b) => a.gatilhoPct - b.gatilhoPct);

    let liberaPctB = 0;
    let faixaAtual = null;
    let proximaFaixaObj = null;

    for (const f of faixasOrdenadas) {
      if (pctVendido >= f.gatilhoPct) {
        liberaPctB = f.liberaPct;
        faixaAtual = f;
      } else if (!proximaFaixaObj) {
        proximaFaixaObj = f;
      }
    }

    const B = mulPct(basePositiva, liberaPctB);

    // Cálculo de D+X em dias úteis bancários (segunda a sexta, sem feriados nacionais)
    const liberaTotalDmais = toNum(regra.liberaTotalDmais !== undefined ? regra.liberaTotalDmais : 2);
    const infoPosEvento = calcularDataLiberacaoPosEvento(
      evento.data,
      liberaTotalDmais,
      evento.dataReferenciaCalculo || null
    );

    const modo = regra.modo || 'MIN';
    let escolhido = modo === 'A' ? A : modo === 'B' ? B : Math.min(A, B);
    const teto = round2(regra.teto);
    if (toCents(teto) > 0) {
      escolhido = Math.min(escolhido, teto);
    }
    if (infoPosEvento.liberadoPosEvento) {
      escolhido = basePositiva;
    }
    escolhido = round2(escolhido);

    const liberadoRegra = addMoney(escolhido, creditosSujeitosTrava ? 0 : creditos);

    // ABATIMENTOS DO EVENTO (em centavos inteiros)
    let advEv = 0;
    if (typeof advancedEvento === 'number') {
      advEv = round2(advancedEvento);
    } else if (Array.isArray(advancedEvento)) {
      advEv = fromCents(
        advancedEvento
          .filter(a => a.abaterNoProximo && (a.escopo === evento.id || a.escopo !== 'consolidado'))
          .reduce((acc, a) => acc + toCents(a.valor), 0)
      );
    }

    let antEv = 0;
    if (typeof antecipacoesEvento === 'number') {
      antEv = round2(antecipacoesEvento);
    } else if (Array.isArray(antecipacoesEvento)) {
      antEv = fromCents(
        antecipacoesEvento
          .filter(a => a.abaterNoProximo && (!a.status || a.status === 'Aprovada' || a.status === 'Paga'))
          .reduce((acc, a) => acc + toCents(a.valor) + toCents(mulPct(a.valor, a.taxaPct)), 0)
      );
    }

    const jaRepassado = round2(evento.jaRepassado);
    const bruto = addMoney(liberadoRegra, -jaRepassado, -advEv, -antEv);
    const liberavel = Math.max(0, bruto);
    const saldoDevedor = Math.max(0, subMoney(0, bruto));
    const retido = Math.max(0, addMoney(Math.max(0, resultado), creditos, -liberadoRegra));

    const proximaFaixa = proximaFaixaObj
      ? {
          gatilhoPct: proximaFaixaObj.gatilhoPct,
          liberaPct: proximaFaixaObj.liberaPct,
          ingressosFaltantes: Math.max(0, Math.ceil((proximaFaixaObj.gatilhoPct / 100) * cap - ingressosContados))
        }
      : null;

    return {
      capacidadeUsada: cap,
      vendidos,
      cortesias: capInfo.cortesias,
      ingressosContados,
      pctVendido: round2(pctVendido),
      bil,
      taxaAdm,
      taxaOp,
      receitaDiskLiquida: round2(taxaAdmLiquida + taxaOp),
      despesas,
      despesasPagas: despesasPagasVal,
      despesasAPagar: despesasAPagarVal,
      despesasTotal: round2(despesasPagasVal + despesasAPagarVal),
      abaterDespesasAPagar,
      totRetencoes,
      totOps,
      reserva,
      resultado,
      rebateBruto,
      rebate,
      patrocinioBruto,
      patrocinio,
      excedente,
      taxaAdmLiquida,
      creditos,
      creditosSujeitosTrava,
      basePositiva,
      pctResultado,
      liberaPctB,
      A,
      B,
      modo,
      teto,
      liberaTotalDmais,
      dataLiberacaoTotal: infoPosEvento.dataLiberacaoTotal,
      liberadoPosEvento: infoPosEvento.liberadoPosEvento,
      escolhido,
      liberadoRegra,
      jaRepassado,
      advEv,
      antEv,
      bruto,
      liberavel,
      saldoDevedor,
      retido,
      faixaAtual,
      faixas: faixasOrdenadas,
      proximaFaixa,
      retencoesDetalhe,
      descontosDetalhe
    };
  }

  /**
   * 3. calcConsolidado(produtora, eventosCalculados, advanced)
   * - eventosCalculados: array ou mapa de objetos { id, liberadoParaSolicitacao, ...calcEvento }
   */
  function calcConsolidado(produtora = {}, eventosCalculados = [], advanced = []) {
    const lista = Array.isArray(eventosCalculados)
      ? eventosCalculados
      : Object.entries(eventosCalculados).map(([id, obj]) => ({ id, ...obj }));

    const eventosLiberados = lista.filter(e => e.liberadoParaSolicitacao !== false);

    const advList = Array.isArray(advanced) ? advanced : Object.values(advanced || {});
    const advConsolidado = fromCents(
      advList
        .filter(a => a && a.abaterNoProximo && a.escopo === 'consolidado')
        .reduce((acc, a) => acc + toCents(a.valor), 0)
    );

    const taxaAdmLiqTotal = fromCents(
      eventosLiberados.reduce((acc, e) => acc + toCents(e.taxaAdmLiquida), 0)
    );

    const patProdCfg = (produtora && produtora.patrocinio) || { ativo: false, descricao: '', valor: 0 };
    const patrocinioProdutoraBruto = patProdCfg.ativo ? round2(patProdCfg.valor) : 0;
    const patrocinioProdutora = fromCents(Math.min(toCents(patrocinioProdutoraBruto), toCents(taxaAdmLiqTotal)));
    const excedentePatrocinioProdutora = Math.max(0, subMoney(patrocinioProdutoraBruto, patrocinioProdutora));

    const devedores = fromCents(
      eventosLiberados.reduce((acc, e) => acc + toCents(e.saldoDevedor), 0)
    );

    const liberavelEventos = fromCents(
      eventosLiberados.reduce((acc, e) => acc + toCents(e.liberavel), 0)
    );

    function disponivel(selecaoIds) {
      if (!Array.isArray(selecaoIds) || selecaoIds.length === 0) return 0;
      const somaSelecionadosCents = eventosLiberados
        .filter(e => selecaoIds.includes(e.id))
        .reduce((acc, e) => acc + toCents(e.liberavel), 0);
      if (somaSelecionadosCents <= 0 && selecaoIds.every(id => !eventosLiberados.some(e => e.id === id))) {
        return 0;
      }
      return Math.max(0, addMoney(fromCents(somaSelecionadosCents), patrocinioProdutora, -advConsolidado, -devedores));
    }

    const saldoDisponivel = disponivel(eventosLiberados.map(e => e.id));

    return {
      eventosLiberadosIds: eventosLiberados.map(e => e.id),
      liberavelEventos,
      taxaAdmLiqTotal,
      patrocinioProdutoraBruto,
      patrocinioProdutora,
      excedentePatrocinioProdutora,
      advConsolidado,
      devedores,
      saldoDisponivel,
      disponivel
    };
  }

  /**
   * 4. bordero_produtor(calcEventoRes)
   * Monta o objeto que o produtor pode ler em /borderos_produtor/{produtoraId}/{eventoId}.
   * PROIBIDO conter qualquer chave com "taxa", "adm", "op" ou "conveniencia".
   */
  function bordero_produtor(calc = {}) {
    const borderoEvento = round2(toNum(calc.bil) - toNum(calc.taxaAdm) - toNum(calc.taxaOp));

    const retencoes = (Array.isArray(calc.retencoesDetalhe) ? calc.retencoesDetalhe : [])
      .filter(r => r.ativo && r.responsavel === 'disk')
      .map(r => ({
        nome: r.nome,
        valor: r.valorCalculado,
        status: r.status
      }));

    const descontosOperacionais = (Array.isArray(calc.descontosDetalhe) ? calc.descontosDetalhe : [])
      .filter(d => d.ativo)
      .map(d => ({
        nome: d.nome,
        qtd: d.quantidade,
        unit: d.valorUnitario,
        valor: d.valor
      }));

    const primeiraFaixaGatilho = Array.isArray(calc.faixas) && calc.faixas.length > 0
      ? calc.faixas[0].gatilhoPct
      : 30;

    const sufixoPosEvento = calc.dataLiberacaoTotal
      ? ` Liberação de 100% em ${calc.dataLiberacaoTotal} (D+${calc.liberaTotalDmais || 2} dias úteis bancários).`
      : '';

    const regraTexto = calc.liberaPctB === 0
      ? `Repasse liberado a partir de ${primeiraFaixaGatilho}% da capacidade vendida. Hoje: ${calc.pctVendido.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%.${sufixoPosEvento}`
      : `Faixa atual: ${calc.liberaPctB}% do resultado (capacidade vendida ${calc.pctVendido.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%). Vale o menor entre esse valor e ${calc.pctResultado}% do resultado.${sufixoPosEvento}`;

    return {
      borderoEvento,
      despesas: round2(calc.despesas),
      despesasPagas: round2(calc.despesasPagas !== undefined ? calc.despesasPagas : calc.despesas),
      despesasAPagar: round2(calc.despesasAPagar || 0),
      retencoes,
      descontosOperacionais,
      resultado: round2(calc.resultado),
      regraTexto,
      faixaAtual: calc.faixaAtual ? { gatilhoPct: calc.faixaAtual.gatilhoPct, liberaPct: calc.faixaAtual.liberaPct } : null,
      faixas: calc.faixas || [],
      pctVendido: round2(calc.pctVendido),
      capacidadeUsada: calc.capacidadeUsada,
      vendidosAtuais: toNum(calc.vendidos),
      pctResultadoRegra: toNum(calc.pctResultado),
      modoRegra: calc.modo || 'MIN',
      proximaFaixa: calc.proximaFaixa,
      liberaTotalDmais: toNum(calc.liberaTotalDmais !== undefined ? calc.liberaTotalDmais : 2),
      dataLiberacaoTotal: calc.dataLiberacaoTotal || '',
      escolhido: round2(calc.escolhido),
      rebate: round2(calc.rebate),
      patrocinio: round2(calc.patrocinio),
      jaRepassado: round2(calc.jaRepassado),
      advEv: round2(calc.advEv),
      antEv: round2(calc.antEv),
      liberavel: round2(calc.liberavel),
      retido: round2(calc.retido)
    };
  }

  /**
   * 5. calcularRateioRepasse(eventosSelecionados, valorSolicitado, modoRateio, rateioManual)
   * Permite ao Financeiro escolher entre:
   * - "proporcional": distribui proporcionalmente ao liberável de cada evento selecionado
   * - "manual": aplica os valores exatos definidos pelo Financeiro por evento, validando a soma
   */
  function calcularRateioRepasse(eventosSelecionados = [], valorSolicitado = 0, modoRateio = 'proporcional', rateioManual = {}) {
    const valSol = round2(Math.max(0, toNum(valorSolicitado)));
    const lista = Array.isArray(eventosSelecionados) ? eventosSelecionados : [];
    const quotasPorEvento = {};

    if (lista.length === 0 || valSol <= 0) {
      return { modoRateio, valido: false, erro: 'Selecione ao menos um evento e valor maior que zero.', quotasPorEvento, somaQuotas: 0 };
    }

    if (modoRateio === 'manual') {
      let somaCents = 0;
      for (const ev of lista) {
        const qCents = Math.max(0, toCents(rateioManual && rateioManual[ev.id]));
        quotasPorEvento[ev.id] = fromCents(qCents);
        somaCents += qCents;
      }
      const diffCents = Math.abs(somaCents - toCents(valSol));
      if (diffCents > 1) {
        return {
          modoRateio: 'manual',
          valido: false,
          erro: `A soma do rateio manual (R$ ${fromCents(somaCents).toFixed(2)}) difere do valor do repasse (R$ ${valSol.toFixed(2)}).`,
          quotasPorEvento,
          somaQuotas: fromCents(somaCents)
        };
      }
      return {
        modoRateio: 'manual',
        valido: true,
        erro: null,
        quotasPorEvento,
        somaQuotas: fromCents(somaCents)
      };
    }

    // Modo proporcional ao liberável de cada evento selecionado (em centavos inteiros)
    const valSolCents = toCents(valSol);
    const somaLiberavelCents = lista.reduce((acc, e) => acc + Math.max(0, toCents(e.liberavel)), 0);
    let acumuladoCents = 0;
    lista.forEach((ev, idx) => {
      if (idx === lista.length - 1) {
        const restanteCents = Math.max(0, valSolCents - acumuladoCents);
        quotasPorEvento[ev.id] = fromCents(restanteCents);
        acumuladoCents += restanteCents;
      } else {
        const prop = somaLiberavelCents > 0 ? Math.max(0, toCents(ev.liberavel)) / somaLiberavelCents : (1 / lista.length);
        const quotaCents = Math.round(valSolCents * prop);
        quotasPorEvento[ev.id] = fromCents(quotaCents);
        acumuladoCents += quotaCents;
      }
    });

    return {
      modoRateio: 'proporcional',
      valido: true,
      erro: null,
      quotasPorEvento,
      somaQuotas: fromCents(acumuladoCents)
    };
  }

  /**
   * 6. simularVendasEvento(...)
   * Simulador "E se?" (What-If) de vendas e metas de liberação para um evento.
   */
  function simularVendasEvento(
    evento = {},
    fin = {},
    negociacao = {},
    despesasLancadas = [],
    advancedEvento = [],
    antecipacoesEvento = [],
    local = {},
    novosVendidos = null,
    metaLiberavelDesejada = null
  ) {
    const atual = calcEvento(evento, fin, negociacao, despesasLancadas, advancedEvento, antecipacoesEvento, local);
    const cap = atual.capacidadeUsada || 1;
    const vendidosOrig = atual.vendidos;
    const ticketMedio = vendidosOrig > 0 ? (atual.bil / vendidosOrig) : 60;

    const vendidosSim = novosVendidos !== null && novosVendidos !== undefined
      ? Math.max(0, Math.min(cap, Math.round(toNum(novosVendidos))))
      : vendidosOrig;

    const evClone = {
      ...evento,
      vendas: {
        ...(evento.vendas || {}),
        vendidos: vendidosSim
      },
      bilheteria: round2(vendidosSim * ticketMedio)
    };

    const simulado = calcEvento(evClone, fin, negociacao, despesasLancadas, advancedEvento, antecipacoesEvento, local);

    // Calcula os marcos para cada faixa configurada + 100% da capacidade
    const faixasAlvo = [...(atual.faixas || []).map(f => f.gatilhoPct), 100];
    const marcosFaixas = faixasAlvo.map(pctAlvo => {
      const ingNecessarios = Math.ceil((pctAlvo / 100) * cap);
      const evMarco = {
        ...evento,
        vendas: { ...(evento.vendas || {}), vendidos: ingNecessarios },
        bilheteria: round2(ingNecessarios * ticketMedio)
      };
      const cMarco = calcEvento(evMarco, fin, negociacao, despesasLancadas, advancedEvento, antecipacoesEvento, local);
      return {
        gatilhoPct: pctAlvo,
        ingressosTotais: ingNecessarios,
        ingressosAdicionais: Math.max(0, ingNecessarios - vendidosOrig),
        bilheteriaProjetada: cMarco.bil,
        resultadoProjetado: cMarco.resultado,
        liberavelProjetado: cMarco.liberavel
      };
    });

    // Busca binária/linear exata de quantos ingressos são necessários para atingir metaLiberavelDesejada
    let metaInfo = null;
    if (metaLiberavelDesejada !== null && toNum(metaLiberavelDesejada) > 0) {
      const metaVal = round2(toNum(metaLiberavelDesejada));
      let encontrado = null;
      for (let ing = vendidosOrig; ing <= cap; ing += Math.max(1, Math.floor(cap / 200))) {
        const evTeste = {
          ...evento,
          vendas: { ...(evento.vendas || {}), vendidos: ing },
          bilheteria: round2(ing * ticketMedio)
        };
        const cTeste = calcEvento(evTeste, fin, negociacao, despesasLancadas, advancedEvento, antecipacoesEvento, local);
        if (cTeste.liberavel >= metaVal - 0.009) {
          encontrado = { ingressosTotais: ing, ingressosFaltantes: Math.max(0, ing - vendidosOrig), liberavelAlcancado: cTeste.liberavel, pctVendido: cTeste.pctVendido };
          break;
        }
      }
      metaInfo = encontrado || {
        atingivelNaCapacidade: false,
        ingressosTotais: cap,
        ingressosFaltantes: Math.max(0, cap - vendidosOrig),
        liberavelMaximoCapacidade: marcosFaixas[marcosFaixas.length - 1]?.liberavelProjetado || 0
      };
    }

    return {
      ticketMedio: round2(ticketMedio),
      atual,
      simulado,
      deltaVendidos: vendidosSim - vendidosOrig,
      deltaLiberavel: round2(simulado.liberavel - atual.liberavel),
      marcosFaixas,
      metaInfo
    };
  }

  /**
   * 7. derivarJaRepassadoPorEvento(eventoId, repasses, fallbackJaRepassado)
   * Deriva o total já repassado de um evento diretamente das quotas registradas em
   * `memoriaCalculo.rateioAplicado` dos repasses ativos (`Aprovado` ou `Pago`),
   * eliminando divergências por condição de corrida entre aprovações/estornos simultâneos.
   */
  function derivarJaRepassadoPorEvento(eventoId, repasses = [], fallbackJaRepassado = 0) {
    if (!eventoId) return round2(fallbackJaRepassado);
    const lista = Array.isArray(repasses) ? repasses : Object.values(repasses || {});
    const possuiHistoricoRateio = lista.some(
      r => r && r.memoriaCalculo && r.memoriaCalculo.rateioAplicado && typeof r.memoriaCalculo.rateioAplicado === 'object'
    );
    if (!possuiHistoricoRateio) {
      return round2(fallbackJaRepassado);
    }
    const somaCents = lista
      .filter(r => r && (r.status === 'Aprovado' || r.status === 'Pago'))
      .reduce((acc, r) => {
        const quota = r.memoriaCalculo && r.memoriaCalculo.rateioAplicado
          ? r.memoriaCalculo.rateioAplicado[eventoId]
          : 0;
        return acc + Math.max(0, toCents(quota || 0));
      }, 0);
    return fromCents(somaCents);
  }

  return {
    toNum,
    toCents,
    fromCents,
    round2,
    addMoney,
    subMoney,
    mulPct,
    capacidadeUsada,
    calcEvento,
    calcConsolidado,
    bordero_produtor,
    ehDiaUtilBancario,
    somarDiasUteis,
    calcularDataLiberacaoPosEvento,
    calcTransferencia,
    calcularRateioRepasse,
    simularVendasEvento,
    derivarJaRepassadoPorEvento
  };
});

if (typeof module === 'object' && module.exports && typeof require === 'function') {
  const path = require('node:path');
  const fs = require('node:fs');
  const baseDir = fs.existsSync(path.join(__dirname, 'shared/money.js'))
    ? __dirname
    : path.resolve(__dirname, 'packages/motor-repasse/src');
  if (fs.existsSync(path.join(baseDir, 'shared/money.js'))) {
    Object.assign(
      module.exports,
      require(path.join(baseDir, 'shared/money')),
      require(path.join(baseDir, 'ledger')),
      require(path.join(baseDir, 'contas')),
      require(path.join(baseDir, 'advanced')),
      require(path.join(baseDir, 'saldos')),
      require(path.join(baseDir, 'rebate')),
      require(path.join(baseDir, 'spread')),
      require(path.join(baseDir, 'fluxoCaixa'))
    );
  }
}


