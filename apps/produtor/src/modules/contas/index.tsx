import { useState } from 'react';
import { PROJECAO_INICIAL_PRODUTOR } from '../../shared/dadosProdutor';

export function ContasProdutorModule() {
  const [contas, setContas] = useState(PROJECAO_INICIAL_PRODUTOR.contas);
  const [banco, setBanco] = useState('');
  const [agencia, setAgencia] = useState('');
  const [conta, setConta] = useState('');
  const [pix, setPix] = useState('');

  const bloq = !banco.trim() || !agencia.trim() || !conta.trim() || !pix.trim();

  function adicionarConta() {
    if (bloq) return;
    setContas(prev => [
      ...prev,
      {
        id: `c_${prev.length + 1}`,
        banco: banco.trim(),
        agencia: agencia.trim(),
        conta: conta.trim(),
        pix: pix.trim(),
        titular: PROJECAO_INICIAL_PRODUTOR.produtoraNome,
        status: 'Pendente',
        padrao: false
      }
    ]);
    setBanco('');
    setAgencia('');
    setConta('');
    setPix('');
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
      <section className="card" style={{ flex: '999 1 640px', minWidth: 0 }}>
        <h2 className="h2">Minhas contas</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {contas.map(ct => {
            const isValidada = ct.status === 'Validada';
            return (
              <div key={ct.id} style={{ border: '1px solid #dde2ee', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '16px', fontWeight: 800 }}>{ct.banco}</span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 800,
                      padding: '5px 10px',
                      borderRadius: '999px',
                      background: isValidada ? '#dcfce7' : '#ffedd5',
                      color: isValidada ? '#065f46' : '#9a3412'
                    }}
                  >
                    {ct.status}
                  </span>
                </div>
                <div className="num" style={{ fontSize: '13px', color: '#5a6584' }}>Ag {ct.agencia} · CC {ct.conta}</div>
                <div style={{ fontSize: '13px', color: '#3d4766' }}>PIX: {ct.pix}</div>
                {ct.padrao && <div style={{ fontSize: '13px', fontWeight: 800, color: '#065f46' }}>Conta padrão de repasse</div>}
                {!isValidada && <div style={{ fontSize: '13px', color: '#9a3412' }}>Aguardando validação do Financeiro. Ainda não recebe repasses.</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ flex: '1 1 380px', minWidth: 0 }}>
        <h2 className="h2">Cadastrar nova conta</h2>
        <label className="lb">
          Banco
          <input className="in tx" value={banco} onChange={e => setBanco(e.target.value)} placeholder="Nome e código do banco" />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
          <label className="lb">
            Agência
            <input className="in" value={agencia} onChange={e => setAgencia(e.target.value)} />
          </label>
          <label className="lb">
            Conta corrente
            <input className="in" value={conta} onChange={e => setConta(e.target.value)} />
          </label>
        </div>
        <label className="lb">
          Chave PIX
          <input className="in tx" value={pix} onChange={e => setPix(e.target.value)} placeholder="CNPJ, e-mail, telefone ou aleatória" />
        </label>
        <div className="sub">A conta precisa ter a mesma titularidade (CNPJ) da produtora.</div>
        <button className="btn" style={{ background: '#1e3a8a', color: '#fff' }} disabled={bloq} onClick={adicionarConta}>
          Enviar para validação
        </button>
      </section>
    </div>
  );
}
