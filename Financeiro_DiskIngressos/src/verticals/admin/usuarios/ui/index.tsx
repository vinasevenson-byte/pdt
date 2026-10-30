import { useState } from 'react';
import type { FinancialModulePlugin } from '../../../../shared/modulePlugin';
import {
  chamarAtribuirPapelUsuarioERP,
  chamarConfigurarAlcadaERP,
  type EstadoFinanceiroRTDB
} from '../../../../shared/firebaseFinanceiro';
import { formatBRL } from '../../../../shared/formatters';

const PAPEIS_ERP = ['financeiro', 'aprovador', 'operador', 'fiscal', 'comercial', 'auditor', 'produtor'];

function UsuariosRbacAlcadaView({ dados }: { dados?: EstadoFinanceiroRTDB }) {
  const usuariosMap = (dados?.usuarios_erp || {}) as Record<string, Record<string, unknown>>;
  const configAlcada = ((dados?.config || {}) as Record<string, Record<string, unknown>>).alcada || {};
  const produtoras = dados?.produtoras || {};

  const [uid, setUid] = useState('');
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState('operador');
  const [produtoraId, setProdutoraId] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [motivoPapel, setMotivoPapel] = useState('');

  const [alcadaAtiva, setAlcadaAtiva] = useState<boolean>(
    configAlcada.ativo !== undefined ? Boolean(configAlcada.ativo) : true
  );
  const [limiteReais, setLimiteReais] = useState<string>(
    String(configAlcada.limiteDuplaAprovacaoReais ?? 50000)
  );
  const [motivoAlcada, setMotivoAlcada] = useState('');

  const [filtroBusca, setFiltroBusca] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const listaUsuarios = Object.entries(usuariosMap).filter(([id, u]) => {
    if (!filtroBusca.trim()) return true;
    const q = filtroBusca.toLowerCase();
    return (
      id.toLowerCase().includes(q) ||
      String(u.email || '').toLowerCase().includes(q) ||
      String(u.nome || '').toLowerCase().includes(q) ||
      String(u.papel || '').toLowerCase().includes(q)
    );
  });

  async function handleSalvarPapel(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    try {
      const res = await chamarAtribuirPapelUsuarioERP({
        uid: uid.trim(),
        email: email.trim(),
        nome: nome.trim(),
        papel,
        produtoraId: papel === 'produtor' ? produtoraId.trim() : undefined,
        ativo,
        motivo: motivoPapel.trim()
      });
      setMensagem(`Papel "${papel}" atribuído com sucesso para ${email} (v${String((res as Record<string, unknown>).versao || 1)}).`);
      setMotivoPapel('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao atribuir papel RBAC.');
    }
  }

  async function handleSalvarAlcada(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    try {
      await chamarConfigurarAlcadaERP({
        ativo: alcadaAtiva,
        limiteDuplaAprovacaoReais: Number(limiteReais),
        motivo: motivoAlcada.trim()
      });
      setMensagem(`Alçada de dupla aprovação atualizada para ${formatBRL(Number(limiteReais))}.`);
      setMotivoAlcada('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao configurar alçada.');
    }
  }

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 className="h2" style={{ margin: 0 }}>Usuários, Papéis (RBAC) e Alçadas (<code>/usuarios_erp</code> · <code>/config/alcada</code>)</h2>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Gestão auditada de Custom Claims no Firebase Auth com segregação de funções (bloqueio de auto-elevação) e alçada de 4 olhos.
        </p>
      </div>

      {erro && <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontWeight: 700, fontSize: '13px' }}>{erro}</div>}
      {mensagem && <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#ecfdf5', color: '#065f46', fontWeight: 700, fontSize: '13px' }}>{mensagem}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '18px' }}>
        <form onSubmit={handleSalvarPapel} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>Atribuir / Alterar Papel RBAC (<code>atribuirPapelUsuarioERP</code>)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label className="lb" style={{ fontSize: '12px' }}>
              UID do Usuário
              <input className="in tx" value={uid} onChange={e => setUid(e.target.value)} placeholder="uid_operador_01" required />
            </label>
            <label className="lb" style={{ fontSize: '12px' }}>
              E-mail Corporativo
              <input className="in tx" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@diskingressos.com.br" required />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label className="lb" style={{ fontSize: '12px' }}>
              Nome Completo
              <input className="in tx" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do Operador" required />
            </label>
            <label className="lb" style={{ fontSize: '12px' }}>
              Papel (Role / SubRole)
              <select className="in tx" value={papel} onChange={e => setPapel(e.target.value)}>
                {PAPEIS_ERP.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          {papel === 'produtor' && (
            <label className="lb" style={{ fontSize: '12px' }}>
              Produtora Vinculada (obrigatório para produtor)
              <select className="in tx" value={produtoraId} onChange={e => setProdutoraId(e.target.value)} required>
                <option value="">Selecione a produtora...</option>
                {Object.entries(produtoras).map(([pid, p]) => (
                  <option key={pid} value={pid}>{String(p.nome || pid)} ({pid})</option>
                ))}
              </select>
            </label>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
            <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
            Usuário Ativo (desmarcar para revogar Custom Claims)
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Motivo da Atribuição / Alteração
            <input className="in tx" value={motivoPapel} onChange={e => setMotivoPapel(e.target.value)} placeholder="Homologação de alçada operacional" required />
          </label>
          <button type="submit" className="btn" style={{ background: '#1e3a8a', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
            Aplicar Papel e Custom Claims
          </button>
        </form>

        <form onSubmit={handleSalvarAlcada} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>Alçada de Dupla Aprovação 4 Olhos (<code>configurarAlcadaERP</code>)</h3>
          <div style={{ fontSize: '13px', color: '#475569', background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
            Configuração vigente em <code>/config/alcada</code>:{' '}
            <strong>{configAlcada.ativo === false ? 'Inativa' : 'Ativa'}</strong> · Limite:{' '}
            <strong>{formatBRL(Number(configAlcada.limiteDuplaAprovacaoReais ?? 50000))}</strong>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
            <input type="checkbox" checked={alcadaAtiva} onChange={e => setAlcadaAtiva(e.target.checked)} />
            Exigir Dupla Aprovação (Operador + Aprovador distintos) acima do limite
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Limite para Dupla Aprovação (R$)
            <input className="in tx" type="number" step="0.01" min="0" value={limiteReais} onChange={e => setLimiteReais(e.target.value)} required />
          </label>
          <label className="lb" style={{ fontSize: '12px' }}>
            Motivo da Alteração da Alçada
            <input className="in tx" value={motivoAlcada} onChange={e => setMotivoAlcada(e.target.value)} placeholder="Revisão de política de tesouraria" required />
          </label>
          <button type="submit" className="btn" style={{ background: '#047857', color: '#fff', minHeight: '38px', fontSize: '13px' }}>
            Salvar Alçada no RTDB
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>Usuários Registrados ({listaUsuarios.length})</h3>
          <input
            className="in tx"
            style={{ maxWidth: '280px' }}
            placeholder="Filtrar por UID, e-mail, nome ou papel..."
            value={filtroBusca}
            onChange={e => setFiltroBusca(e.target.value)}
          />
        </div>
        {listaUsuarios.length === 0 ? (
          <p className="sub">Nenhum usuário registrado em <code>/usuarios_erp</code>.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px' }}>UID / E-mail</th>
                <th style={{ padding: '8px' }}>Nome</th>
                <th style={{ padding: '8px' }}>Papel RBAC</th>
                <th style={{ padding: '8px' }}>Produtora</th>
                <th style={{ padding: '8px' }}>Status / Versão</th>
                <th style={{ padding: '8px' }}>Última Alteração</th>
              </tr>
            </thead>
            <tbody>
              {listaUsuarios.map(([id, u]) => (
                <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px' }}>
                    <div style={{ fontWeight: 700 }}>{String(u.email || id)}</div>
                    <code style={{ fontSize: '11px', color: '#64748b' }}>{id}</code>
                  </td>
                  <td style={{ padding: '8px' }}>{String(u.nome || '—')}</td>
                  <td style={{ padding: '8px', fontWeight: 700 }}>{String(u.papel || '—')}</td>
                  <td style={{ padding: '8px' }}>{String(u.produtoraId || '—')}</td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ color: u.status === 'Ativo' ? '#065f46' : '#b91c1c', fontWeight: 700 }}>
                      {String(u.status || 'Ativo')}
                    </span>{' '}
                    (v{String(u.versao || 1)})
                  </td>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#475569' }}>
                    {String(u.atualizadoPor || '—')} · {String(u.atualizadoEm || '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export const modulePlugin: FinancialModulePlugin = {
  id: 'usuarios',
  title: 'Usuários, Papéis (RBAC) e Alçadas',
  description: 'Gestão auditada de Custom Claims (financeiro, aprovador, operador, fiscal, comercial, auditor, produtor) e alçada de dupla aprovação.',
  rtdbNode: 'usuarios_erp',
  requiresJavaService: false,
  render: (dados) => <UsuariosRbacAlcadaView dados={dados} />
};
