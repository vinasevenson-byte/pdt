import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../shared/modulePlugin';
import {
  chamarCallableFinanceiro,
  type EstadoFinanceiroRTDB
} from '../../../../shared/firebaseFinanceiro';

function FornecedoresOpView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const fornecedoresMap = (dados?.fornecedores_op || {}) as Record<string, Record<string, unknown>>;
  const [eventoId, setEventoId] = useState('polaquedo');
  const [fornecedorNome, setFornecedorNome] = useState('');
  const [fornecedorCnpj, setFornecedorCnpj] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = Object.entries(fornecedoresMap);

  async function handleLancar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    try {
      await chamarCallableFinanceiro('lancarDespesaOperacionalEvento', {
        eventoId: eventoId.trim(),
        fornecedor: { nome: fornecedorNome.trim(), cnpj: fornecedorCnpj.trim() },
        descricao: descricao.trim(),
        valor: Number(valor),
        status: 'A pagar'
      });
      setMsg(`Despesa operacional lançada no borderô de ${eventoId}.`);
      setDescricao('');
      setValor('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao lançar despesa operacional.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h2 className="h2" style={{ margin: 0 }}>Fornecedores e Compras Operacionais (<code>/fornecedores_op</code>)</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Homologação de fornecedores com CNPJ validado, provisão em Contas a Pagar e lançamento imediato no borderô do evento.
        </p>
      </div>
      <form onSubmit={handleLancar} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', alignItems: 'end' }}>
        <label className="lb" style={{ fontSize: '12px' }}>
          Evento ID
          <input className="in tx" value={eventoId} onChange={e => setEventoId(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Razão Social Fornecedor
          <input className="in tx" value={fornecedorNome} onChange={e => setFornecedorNome(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          CNPJ Fornecedor
          <input className="in tx" value={fornecedorCnpj} onChange={e => setFornecedorCnpj(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Descrição da Despesa
          <input className="in tx" value={descricao} onChange={e => setDescricao(e.target.value)} required />
        </label>
        <label className="lb" style={{ fontSize: '12px' }}>
          Valor (R$)
          <input className="in tx" type="number" step="0.01" min="0.01" value={valor} onChange={e => setValor(e.target.value)} required />
        </label>
        <button type="submit" className="btn" style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
          Lançar Despesa e CP
        </button>
      </form>
      {erro && <div style={{ color: '#b91c1c', fontSize: '13px', fontWeight: 700 }}>{erro}</div>}
      {msg && <div style={{ color: '#065f46', fontSize: '13px', fontWeight: 700 }}>{msg}</div>}
      {lista.length === 0 ? (
        <p className="sub">Nenhum fornecedor registrado em <code>/fornecedores_op</code>.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '8px' }}>ID</th>
              <th style={{ padding: '8px' }}>Razão Social</th>
              <th style={{ padding: '8px' }}>CNPJ</th>
              <th style={{ padding: '8px' }}>Categoria</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(([id, f]) => (
              <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px', fontWeight: 700 }}>{id}</td>
                <td style={{ padding: '8px' }}>{String(f.nome || '')}</td>
                <td style={{ padding: '8px' }}>{String(f.cnpj || '')}</td>
                <td style={{ padding: '8px' }}>{String(f.categoria || 'Operacional')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'fornecedores',
  title: 'Fornecedores e Compras Operacionais',
  description: 'Cadastro de fornecedores de eventos, lançamento de despesas operacionais no borderô e provisão automática em Contas a Pagar.',
  rtdbNode: 'fornecedores_op',
  requiresJavaService: false,
  render: (dados) => <FornecedoresOpView dados={dados} />
};
