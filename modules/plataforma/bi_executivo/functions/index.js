/**
 * Cloud Function Handler — Módulo BI Executivo e DRE Gerencial (plataforma/bi_executivo)
 */
'use strict';

const {
  db: defaultDb,
  httpsV2,
  formatarDataHoraBR,
  registrarAuditoria,
  temPermissao,
  publicarEventoDominio
} = require('../../../../services/functions/src/shared/recalculo');
const { calcularDreExecutivoERP } = require('../domain');
const { onCall, HttpsError } = httpsV2;

async function executarGerarSnapshotBiExecutivo(request, deps = {}) {
  const db = deps.db || defaultDb;
  const nowDate = deps.nowDate || new Date();
  const auth = request.auth;

  if (!auth || !temPermissao(auth.token, 'bi:ler')) {
    throw new HttpsError(
      'permission-denied',
      'Apenas perfis com permissão "bi:ler" (financeiro, aprovador, fiscal, auditor) podem consultar ou gerar o DRE Executivo.'
    );
  }

  const dados = request.data || {};
  const chaveSnapshot = String(dados.chaveSnapshot || 'consolidado_atual').trim();

  const [
    prodSnap,
    locSnap,
    evSnap,
    finSnap,
    negSnap,
    despSnap,
    advSnap,
    antSnap,
    repSnap,
    cpSnap,
    crSnap
  ] = await Promise.all([
    db.ref('/produtoras').get(),
    db.ref('/locais').get(),
    db.ref('/eventos').get(),
    db.ref('/eventos_fin').get(),
    db.ref('/negociacoes').get(),
    db.ref('/despesas').get(),
    db.ref('/advanced').get(),
    db.ref('/antecipacoes').get(),
    db.ref('/repasses').get(),
    db.ref('/contas_pagar').get(),
    db.ref('/contas_receber').get()
  ]);

  const dre = calcularDreExecutivoERP({
    produtoras: prodSnap.val() || {},
    locais: locSnap.val() || {},
    eventos: evSnap.val() || {},
    eventosFin: finSnap.val() || {},
    negociacoes: negSnap.val() || {},
    despesas: despSnap.val() || {},
    advanced: advSnap.val() || {},
    antecipacoes: antSnap.val() || {},
    repasses: repSnap.val() || {},
    contasPagar: cpSnap.val() || {},
    contasReceber: crSnap.val() || {}
  });

  const usuario = auth.token.email || auth.uid;
  const geradoEm = formatarDataHoraBR(nowDate);

  const snapshotPayload = {
    id: chaveSnapshot,
    status: 'Consolidado',
    geradoEm,
    geradoPor: usuario,
    ...dre
  };

  await db.ref(`/bi_executivo/${chaveSnapshot}`).set(snapshotPayload);

  await registrarAuditoria(
    {
      usuario,
      modulo: 'plataforma/bi_executivo',
      eventoId: '',
      acao: 'Geração de Snapshot DRE / BI Executivo',
      resumo: `Snapshot BI "${chaveSnapshot}" gerado: GMV R$ ${dre.gmvBilheteriaBruta.toFixed(2)}, Receita Líquida Disk R$ ${dre.dreDisk.receitaLiquidaDisk.toFixed(2)} (Take Rate ${dre.dreDisk.takeRateLiquidoPct}%).`
    },
    db
  );

  await publicarEventoDominio(db, {
    tipo: 'SnapshotBiExecutivoGerado',
    origemModulo: 'plataforma/bi_executivo',
    referenciaId: chaveSnapshot,
    payload: {
      chaveSnapshot,
      gmvBilheteriaBrutaCents: dre.gmvBilheteriaBrutaCents,
      receitaLiquidaDiskCents: dre.dreDisk.receitaLiquidaDiskCents,
      seloDreSha256: dre.seloDreSha256
    }
  });

  return snapshotPayload;
}

exports.gerarSnapshotBiExecutivo = onCall(request => executarGerarSnapshotBiExecutivo(request));
exports.executarGerarSnapshotBiExecutivo = executarGerarSnapshotBiExecutivo;
exports.processar_plataforma_bi_executivo = onCall(request => executarGerarSnapshotBiExecutivo(request));
