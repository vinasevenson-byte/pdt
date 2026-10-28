import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';

export const saldosModule: FinancialModulePlugin = {
  id: 'saldos',
  title: 'Saldos por Produtora',
  description: 'Posição consolidada por produtora: retido, liberável, repassado, em antecipação, advanced e vínculo com contas bancárias.',
  rtdbNode: 'saldos',
  render: (dados, _sessao, nav) => {
    const lista = Object.entries(dados?.saldos || {});
    const produtoras = dados?.produtoras || {};
    const contasPorProd = dados?.contasPorProdutora || {};
    const filtroAtual = nav?.filtroProdutoraId || '';

    const listaFiltrada = filtroAtual
      ? lista.filter(([prodId]) => prodId === filtroAtual)
      : lista;

    return (
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <h2 className="h2" style={{ margin: 0 }}>Posição de Saldos por Produtora (<code>/saldos/&#123;produtoraId&#125;</code>)</h2>
            <p className="sub" style={{ margin: '4px 0 0' }}>
              Visão consolidada do Financeiro com navegação direta para homologação de Contas Bancárias e fila de Repasses da produtora.
            </p>
          </div>
          {filtroAtual && (
            <button
              className="btn"
              onClick={() => nav?.setFiltroProdutoraId?.('')}
              style={{ background: '#e2e8f0', color: '#0f172a', minHeight: '36px', fontSize: '13px' }}
            >
              Mostrar todas as produtoras (limpar filtro: {filtroAtual})
            </button>
          )}
        </div>

        {listaFiltrada.length === 0 ? (
          <p className="sub">Nenhuma posição de saldo encontrada em <code>/saldos</code>.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '10px 8px' }}>Produtora</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Liberável</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Retido</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Já Repassado</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Saldo Disponível</th>
                <th style={{ padding: '10px 8px' }}>Contas Bancárias</th>
                <th style={{ padding: '10px 8px' }}>Fluxo Operacional</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map(([prodId, s]) => {
                const prodMeta = produtoras[prodId] || {};
                const contasMap = contasPorProd[prodId] || {};
                const contasEntries = Object.values(contasMap);
                const validadas = contasEntries.filter(c => c?.status === 'Validada').length;
                const pendentes = contasEntries.filter(c => c?.status !== 'Validada').length;
                const liberavel = Number(s.saldoLiberavel ?? s.liberavelTotal ?? s.liberavelEventos ?? 0);
                const retido = Number(s.saldoRetido ?? s.retidoTotal ?? 0);
                const repassado = Number(s.totalRepassadoLiquido ?? s.jaRepassadoTotal ?? 0);
                const disponivel = Number(s.saldoDisponivel ?? 0);

                return (
                  <tr key={prodId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ fontWeight: 800 }}>{String(prodMeta.nome || prodId)}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        <code>{prodId}</code> {prodMeta.cnpj ? `· CNPJ ${String(prodMeta.cnpj)}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{formatBRL(liberavel)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#9a3412' }}>{formatBRL(retido)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>{formatBRL(repassado)}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800, color: '#065f46' }}>
                      {formatBRL(disponivel)}
                    </td>
                    <td style={{ padding: '10px 8px', fontSize: '13px' }}>
                      <span style={{ color: validadas > 0 ? '#065f46' : '#b91c1c', fontWeight: 700 }}>
                        {validadas} validada(s)
                      </span>
                      {pendentes > 0 && (
                        <span style={{ color: '#b45309', marginLeft: '6px' }}>
                          · {pendentes} pendente(s)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => nav?.navegarPara('contas', prodId)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #1e3a8a',
                            background: '#eef2ff',
                            color: '#1e3a8a',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          Contas Bancárias →
                        </button>
                        <button
                          type="button"
                          onClick={() => nav?.navegarPara('repasses', prodId)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #047857',
                            background: '#ecfdf5',
                            color: '#065f46',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          Repasses →
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    );
  }
};
