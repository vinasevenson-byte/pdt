/**
 * Domínio Puro — Módulo Notificações, Alertas e Jobs (plataforma/notificacoes)
 * - Processa eventos pendentes do outbox `/eventos_dominio` gerando notificações limpas por `produtoraId`
 * - Nunca inclui termos internos confidenciais nas mensagens destinadas ao produtor
 */
'use strict';

function gerarNotificacoesDeOutbox(eventosDominioMap = {}, dataHora = '') {
  const notificacoesGeradas = [];
  const eventosProcessadosIds = [];

  for (const [evDomId, evDom] of Object.entries(eventosDominioMap || {})) {
    if (!evDom || evDom.status === 'Processado') continue;

    const tipo = String(evDom.tipo || 'EventoSistema');
    const produtoraId = String(evDom.produtoraId || '').trim();
    const eventoId = String(evDom.eventoId || '').trim();
    const refId = String(evDom.referenciaId || evDomId);

    eventosProcessadosIds.push(evDomId);

    if (!produtoraId) continue;

    let titulo = `Atualização operacional (${tipo})`;
    let mensagem = `Referência ${refId} registrada no Hub de Repasses.`;
    let canal = 'PORTAL_E_EMAIL';

    if (tipo === 'RepasseLiquidado' || tipo === 'RepasseAprovado') {
      titulo = 'Repasse atualizado';
      mensagem = `O repasse ${refId} teve atualização de status financeiro.`;
      canal = 'PORTAL_EMAIL_WHATSAPP';
    } else if (tipo === 'LoteVendasRegistrado') {
      titulo = 'Novo lote de vendas contabilizado no borderô';
      mensagem = `O lote ${refId} do evento ${eventoId} atualizou o saldo do borderô.`;
    } else if (tipo === 'ContratoComercialPublicado' || tipo === 'AditivoContratualPublicado') {
      titulo = 'Contrato / Aditivo publicado';
      mensagem = `Uma nova versão contratual (${refId}) foi disponibilizada para consulta.`;
    }

    notificacoesGeradas.push({
      id: `ntf_${evDomId}`,
      origemEventoDominioId: evDomId,
      produtoraId,
      eventoId,
      tipo,
      canal,
      titulo,
      mensagem,
      lida: false,
      status: 'Enviada',
      criadaEm: dataHora
    });
  }

  return {
    quantidadeEventosProcessados: eventosProcessadosIds.length,
    quantidadeNotificacoesGeradas: notificacoesGeradas.length,
    eventosProcessadosIds,
    notificacoesGeradas
  };
}

module.exports = {
  gerarNotificacoesDeOutbox
};
