import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { atualizarStatusContaBancariaRTDB } from '../../shared/firebaseFinanceiro';

export const contasModule: FinancialModulePlugin = {
  id: 'contas',
  title: 'Contas Bancárias',
  description: 'Homologação e validação de contas bancárias e chaves PIX das produtoras.',
  rtdbNode: 'contas',
  render: (dados, sessao) => {
    const porProd = dados?.contasPorProdutora || {};
    const email = sessao?.email || 'financeiro';
    const linhas: Array<{ produtoraId: string; contaId: string; c: Record<string, unknown> }> = [];
    for (const [prodId, mapa] of Object.entries(porProd)) {
      for (const [cId, c] of Object.entries(mapa || {})) {
        linhas.push({ produtoraId: prodId, contaId: cId, c });
      }
    }
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Contas Bancárias (<code>/contas/&#123;produtoraId&#125;</code>)</h2>
          <p style={{ color: '#475569', margin: '4px 0 0' }}>
            Validação de titularidade e chaves PIX para habilitação de solicitações de repasse.
          </p>
        </div>
        {linhas.length === 0 ? (
          <p style={{ color: '#64748b' }}>Nenhuma conta bancária cadastrada no RTDB.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>Produtora</th>
                <th style={{ padding: '8px' }}>Banco / Agência / Conta</th>
                <th style={{ padding: '8px' }}>Chave PIX</th>
                <th style={{ padding: '8px' }}>Status</th>
                <th style={{ padding: '8px' }}>Homologação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ produtoraId, contaId, c }) => {
                const st = String(c.status || 'Pendente');
                return (
                  <tr key={`${produtoraId}_${contaId}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{produtoraId}</td>
                    <td style={{ padding: '8px' }}>{String(c.banco || '')} · Ag {String(c.agencia || '')} · CC {String(c.conta || '')}</td>
                    <td style={{ padding: '8px' }}>{String(c.pix || '')}</td>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{st}</td>
                    <td style={{ padding: '8px', display: 'flex', gap: '6px' }}>
                      {st !== 'Validada' && (
                        <button
                          onClick={() => atualizarStatusContaBancariaRTDB(produtoraId, contaId, 'Validada', email)}
                          style={{ padding: '4px 8px', borderRadius: '4px', border: 0, background: '#047857', color: '#fff', cursor: 'pointer' }}
                        >
                          Validar Conta
                        </button>
                      )}
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
