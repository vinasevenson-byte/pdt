import { useState } from 'react';
import type { FinancialModulePlugin } from '../../shared/modulePlugin';
import { formatBRL } from '../../shared/formatters';
import {
  firebaseFinanceiroConfigurado,
  chamarSalvarProdutora,
  chamarSalvarLocal,
  chamarSalvarEvento,
  chamarAlterarStatusCadastro
} from '../../shared/firebaseFinanceiro';
import { renderizarPainelDecisaoInline, type ConfigModalDecisao } from '../../shared/ModalDecisaoFinanceira';

interface SetorLocalUI {
  nome: string;
  capacidade: number;
}

function ModuloCadastroPainel({
  dados
}: {
  dados?: {
    produtoras?: Record<string, Record<string, unknown>>;
    locais?: Record<string, Record<string, unknown>>;
    eventos?: Record<string, Record<string, unknown>>;
  };
}) {
  const [abaAtiva, setAbaAtiva] = useState<'produtoras' | 'locais' | 'eventos'>('produtoras');
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [modalDecisao, setModalDecisao] = useState<ConfigModalDecisao | null>(null);

  // Estado Produtora
  const [prodId, setProdId] = useState<string>('');
  const [prodNome, setProdNome] = useState<string>('');
  const [prodCnpj, setProdCnpj] = useState<string>('');
  const [prodPatrocinioAtivo, setProdPatrocinioAtivo] = useState<boolean>(false);
  const [prodPatrocinioDesc, setProdPatrocinioDesc] = useState<string>('');
  const [prodPatrocinioValor, setProdPatrocinioValor] = useState<string>('0');

  // Estado Local
  const [locId, setLocId] = useState<string>('');
  const [locNome, setLocNome] = useState<string>('');
  const [locCidade, setLocCidade] = useState<string>('');
  const [locUf, setLocUf] = useState<string>('PR');
  const [locSetores, setLocSetores] = useState<SetorLocalUI[]>([{ nome: 'Pista', capacidade: 1000 }]);

  // Estado Evento
  const [evId, setEvId] = useState<string>('');
  const [evNome, setEvNome] = useState<string>('');
  const [evData, setEvData] = useState<string>('');
  const [evProdutoraId, setEvProdutoraId] = useState<string>('');
  const [evLocalId, setEvLocalId] = useState<string>('');
  const [evLiberado, setEvLiberado] = useState<boolean>(true);
  const [evModoCap, setEvModoCap] = useState<'local' | 'setores' | 'manual'>('local');
  const [evSetoresAbertos, setEvSetoresAbertos] = useState<string[]>([]);
  const [evCapManual, setEvCapManual] = useState<string>('1000');
  const [evContarCortesias, setEvContarCortesias] = useState<boolean>(false);

  const produtorasMap = dados?.produtoras || {};
  const locaisMap = dados?.locais || {};
  const eventosMap = dados?.eventos || {};

  function limparMensagens() {
    setErro(null);
    setSucesso(null);
  }

  function editarProdutora(id: string, p: Record<string, unknown>) {
    limparMensagens();
    setProdId(id);
    setProdNome(String(p.nome || ''));
    setProdCnpj(String(p.cnpj || ''));
    const pat = (p.patrocinio || {}) as Record<string, unknown>;
    setProdPatrocinioAtivo(Boolean(pat.ativo));
    setProdPatrocinioDesc(String(pat.descricao || ''));
    setProdPatrocinioValor(String(Number(pat.valor || 0)));
  }

  function limparFormProdutora() {
    limparMensagens();
    setProdId('');
    setProdNome('');
    setProdCnpj('');
    setProdPatrocinioAtivo(false);
    setProdPatrocinioDesc('');
    setProdPatrocinioValor('0');
  }

  function editarLocal(id: string, l: Record<string, unknown>) {
    limparMensagens();
    setLocId(id);
    setLocNome(String(l.nome || ''));
    setLocCidade(String(l.cidade || ''));
    setLocUf(String(l.uf || 'PR'));
    const setores = Array.isArray(l.setores)
      ? (l.setores as Array<Record<string, unknown>>).map(s => ({
          nome: String(s.nome || ''),
          capacidade: Number(s.capacidade || 0)
        }))
      : [{ nome: 'Geral', capacidade: Number(l.capacidadeTotal || 1000) }];
    setLocSetores(setores.length > 0 ? setores : [{ nome: 'Geral', capacidade: 1000 }]);
  }

  function limparFormLocal() {
    limparMensagens();
    setLocId('');
    setLocNome('');
    setLocCidade('');
    setLocUf('PR');
    setLocSetores([{ nome: 'Pista', capacidade: 1000 }]);
  }

  function editarEvento(id: string, ev: Record<string, unknown>) {
    limparMensagens();
    setEvId(id);
    setEvNome(String(ev.nome || ''));
    setEvData(String(ev.data || ''));
    setEvProdutoraId(String(ev.produtoraId || ''));
    setEvLocalId(String(ev.localId || ''));
    setEvLiberado(Boolean(ev.liberadoParaSolicitacao));
    const cap = (ev.capacidade || {}) as Record<string, unknown>;
    const modo = (cap.modo as 'local' | 'setores' | 'manual') || 'local';
    setEvModoCap(modo);
    setEvSetoresAbertos(Array.isArray(cap.setoresAbertos) ? (cap.setoresAbertos as string[]) : []);
    setEvCapManual(String(Number(cap.manual || 1000)));
    setEvContarCortesias(Boolean(cap.contarCortesias));
  }

  function limparFormEvento() {
    limparMensagens();
    setEvId('');
    setEvNome('');
    setEvData('');
    setEvProdutoraId(Object.keys(produtorasMap)[0] || '');
    setEvLocalId(Object.keys(locaisMap)[0] || '');
    setEvLiberado(true);
    setEvModoCap('local');
    setEvSetoresAbertos([]);
    setEvCapManual('1000');
    setEvContarCortesias(false);
  }

  async function handleSalvarProdutora() {
    limparMensagens();
    setProcessando(true);
    try {
      const res = (await chamarSalvarProdutora({
        id: prodId || undefined,
        nome: prodNome,
        cnpj: prodCnpj,
        patrocinio: {
          ativo: prodPatrocinioAtivo,
          descricao: prodPatrocinioDesc,
          valor: Number(prodPatrocinioValor || 0)
        }
      })) as { id?: string; criado?: boolean };
      setSucesso(
        `Produtora ${res.id || prodId} ${res.criado ? 'cadastrada' : 'atualizada'} com sucesso (CNPJ validado e reservado atomicamente).`
      );
      if (res.criado) limparFormProdutora();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar produtora.');
    } finally {
      setProcessando(false);
    }
  }

  async function handleSalvarLocal() {
    limparMensagens();
    setProcessando(true);
    try {
      const capTotal = locSetores.reduce((s, st) => s + Number(st.capacidade || 0), 0);
      const res = (await chamarSalvarLocal({
        id: locId || undefined,
        nome: locNome,
        cidade: locCidade,
        uf: locUf,
        capacidadeTotal: capTotal,
        setores: locSetores
      })) as { id?: string; criado?: boolean };
      setSucesso(`Local ${res.id || locId} ${res.criado ? 'cadastrado' : 'atualizado'} com sucesso.`);
      if (res.criado) limparFormLocal();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar local.');
    } finally {
      setProcessando(false);
    }
  }

  async function handleSalvarEvento() {
    limparMensagens();
    setProcessando(true);
    try {
      const res = (await chamarSalvarEvento({
        id: evId || undefined,
        nome: evNome,
        data: evData,
        produtoraId: evProdutoraId,
        localId: evLocalId,
        liberadoParaSolicitacao: evLiberado,
        capacidade: {
          modo: evModoCap,
          setoresAbertos: evSetoresAbertos,
          manual: Number(evCapManual || 0),
          contarCortesias: evContarCortesias
        }
      })) as { id?: string; criado?: boolean };
      setSucesso(
        `Evento ${res.id || evId} ${res.criado ? 'cadastrado' : 'atualizado'} preservando vendas, bilheteria e jaRepassado.`
      );
      if (res.criado) limparFormEvento();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar evento.');
    } finally {
      setProcessando(false);
    }
  }

  function solicitarAlterarStatus(tipo: 'produtora' | 'local' | 'evento', id: string, nome: string, ativoAtual: boolean) {
    limparMensagens();
    if (!ativoAtual) {
      // Reativar direto
      setProcessando(true);
      chamarAlterarStatusCadastro({ tipo, id, ativo: true })
        .then(() => setSucesso(`Registro ${id} (${nome}) reativado com sucesso.`))
        .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao reativar cadastro.'))
        .finally(() => setProcessando(false));
      return;
    }

    setModalDecisao({
      titulo: `Inativar ${tipo} ${nome} (${id})`,
      subtitulo:
        'Registros não são apagados no ERP. A inativação bloqueia solicitações de repasse e exige que não existam repasses em andamento ou eventos ativos dependentes.',
      labelConfirmar: 'Confirmar Inativação',
      corConfirmar: 'danger',
      exigirMotivo: true,
      labelMotivo: 'Motivo da inativação (obrigatório para trilha de auditoria)',
      placeholderMotivo: 'Ex.: Encerramento contratual / Evento adiado sem nova data',
      onConfirmar: async ({ motivo }) => {
        setModalDecisao(null);
        setProcessando(true);
        try {
          await chamarAlterarStatusCadastro({ tipo, id, ativo: false, motivo });
          setSucesso(`Registro ${id} (${nome}) inativado com sucesso.`);
        } catch (e: unknown) {
          setErro(e instanceof Error ? e.message : 'Falha ao inativar cadastro.');
        } finally {
          setProcessando(false);
        }
      }
    });
  }

  const eventoEmEdicao = evId ? (eventosMap[evId] as Record<string, unknown> | undefined) : undefined;
  const vendasEvEdicao = (eventoEmEdicao?.vendas || {}) as Record<string, unknown>;
  const localEvTravado =
    Boolean(eventoEmEdicao) &&
    (Number(vendasEvEdicao.vendidos || 0) > 0 ||
      Number(vendasEvEdicao.cortesias || 0) > 0 ||
      Number(eventoEmEdicao?.jaRepassado || 0) > 0);
  const localSelecionadoObj = (locaisMap[evLocalId] || {}) as Record<string, unknown>;
  const setoresDoLocalSelecionado = Array.isArray(localSelecionadoObj.setores)
    ? (localSelecionadoObj.setores as Array<Record<string, unknown>>)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {renderizarPainelDecisaoInline(modalDecisao, () => setModalDecisao(null))}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '1rem 1.25rem',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '0.75rem'
        }}
      >
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
            Cadastro Mestre — Produtoras, Locais e Eventos
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Escritas diretas bloqueadas no RTDB. CNPJ único com reserva atômica, dono do evento imutável e preservação transacional de vendas e repasses.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['produtoras', 'locais', 'eventos'] as const).map(aba => (
            <button
              key={aba}
              type="button"
              className="btn-outline"
              onClick={() => {
                limparMensagens();
                setAbaAtiva(aba);
              }}
              style={{
                background: abaAtiva === aba ? '#1d4ed8' : undefined,
                borderColor: abaAtiva === aba ? '#3b82f6' : undefined,
                color: abaAtiva === aba ? '#fff' : undefined,
                textTransform: 'capitalize'
              }}
            >
              {aba} ({aba === 'produtoras' ? Object.keys(produtorasMap).length : aba === 'locais' ? Object.keys(locaisMap).length : Object.keys(eventosMap).length})
            </button>
          ))}
        </div>
      </div>

      {!firebaseFinanceiroConfigurado && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            color: '#fcd34d',
            fontSize: '0.82rem'
          }}
        >
          Modo simulador local detectado: os dados carregados do seed são exibidos abaixo. Para executar as Cloud Functions{' '}
          <code>salvarProdutora</code>, <code>salvarLocal</code>, <code>salvarEvento</code> e{' '}
          <code>alterarStatusCadastro</code>, conecte ao Firebase ou Emulator.
        </div>
      )}

      {erro && (
        <div
          style={{
            padding: '0.85rem 1rem',
            borderRadius: '0.5rem',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            fontSize: '0.85rem'
          }}
        >
          <strong>Operação recusada:</strong> {erro}
        </div>
      )}

      {sucesso && (
        <div
          style={{
            padding: '0.85rem 1rem',
            borderRadius: '0.5rem',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#6ee7b7',
            fontSize: '0.85rem'
          }}
        >
          {sucesso}
        </div>
      )}

      {abaAtiva === 'produtoras' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1.25rem' }}>
          <div style={{ padding: '1rem', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', color: '#f8fafc' }}>
              {prodId ? `Editar Produtora (${prodId})` : 'Nova Produtora'}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                Razão Social / Nome Fantasia
                <input
                  type="text"
                  value={prodNome}
                  onChange={e => setProdNome(e.target.value)}
                  placeholder="Ex.: Prime Shows Entretenimento Ltda"
                  style={{ width: '100%', marginTop: '0.25rem', padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                />
              </label>
              <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                CNPJ (dígitos verificadores validados + reserva atômica em /cadastro_cnpj)
                <input
                  type="text"
                  value={prodCnpj}
                  onChange={e => setProdCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  style={{ width: '100%', marginTop: '0.25rem', padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={prodPatrocinioAtivo}
                  onChange={e => setProdPatrocinioAtivo(e.target.checked)}
                />
                Patrocínio comercial ativo
              </label>
              {prodPatrocinioAtivo && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={prodPatrocinioDesc}
                    onChange={e => setProdPatrocinioDesc(e.target.value)}
                    placeholder="Descrição do patrocínio"
                    style={{ padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                  />
                  <input
                    type="number"
                    value={prodPatrocinioValor}
                    onChange={e => setProdPatrocinioValor(e.target.value)}
                    placeholder="Valor (R$)"
                    style={{ padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn-primary" disabled={processando} onClick={handleSalvarProdutora}>
                  {prodId ? 'Salvar Alterações' : 'Cadastrar Produtora'}
                </button>
                {prodId && (
                  <button type="button" className="btn-outline" onClick={limparFormProdutora}>
                    Novo Cadastro
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Produtora</th>
                  <th>CNPJ</th>
                  <th>Patrocínio</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(produtorasMap).map(([id, p]) => {
                  const ativo = p.ativo !== false;
                  const pat = (p.patrocinio || {}) as Record<string, unknown>;
                  return (
                    <tr key={id}>
                      <td><code>{id}</code></td>
                      <td><strong>{String(p.nome || id)}</strong></td>
                      <td><code>{String(p.cnpj || '—')}</code></td>
                      <td>{pat.ativo ? formatBRL(Number(pat.valor || 0)) : 'Inativo'}</td>
                      <td>
                        <span className={`badge ${ativo ? 'badge-success' : 'badge-danger'}`}>
                          {ativo ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: '0.35rem' }}>
                        <button type="button" className="btn-outline" onClick={() => editarProdutora(id, p)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => solicitarAlterarStatus('produtora', id, String(p.nome || id), ativo)}
                        >
                          {ativo ? 'Inativar' : 'Reativar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {abaAtiva === 'locais' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1.25rem' }}>
          <div style={{ padding: '1rem', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', color: '#f8fafc' }}>
              {locId ? `Editar Local (${locId})` : 'Novo Local'}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                Nome do Local / Casa de Shows
                <input
                  type="text"
                  value={locNome}
                  onChange={e => setLocNome(e.target.value)}
                  placeholder="Ex.: Teatro Positivo"
                  style={{ width: '100%', marginTop: '0.25rem', padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                  Cidade
                  <input
                    type="text"
                    value={locCidade}
                    onChange={e => setLocCidade(e.target.value)}
                    placeholder="Curitiba"
                    style={{ width: '100%', marginTop: '0.25rem', padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                  />
                </label>
                <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                  UF
                  <input
                    type="text"
                    maxLength={2}
                    value={locUf}
                    onChange={e => setLocUf(e.target.value.toUpperCase())}
                    style={{ width: '100%', marginTop: '0.25rem', padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                  />
                </label>
              </div>

              <div style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                Setores do Local (soma: {locSetores.reduce((s, st) => s + Number(st.capacidade || 0), 0)} lugares)
                {locSetores.map((st, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: '0.4rem', marginTop: '0.35rem' }}>
                    <input
                      type="text"
                      value={st.nome}
                      onChange={e => {
                        const copia = [...locSetores];
                        copia[idx] = { ...copia[idx], nome: e.target.value };
                        setLocSetores(copia);
                      }}
                      placeholder="Nome do setor"
                      style={{ padding: '0.4rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                    />
                    <input
                      type="number"
                      value={st.capacidade}
                      onChange={e => {
                        const copia = [...locSetores];
                        copia[idx] = { ...copia[idx], capacidade: Number(e.target.value || 0) };
                        setLocSetores(copia);
                      }}
                      placeholder="Capacidade"
                      style={{ padding: '0.4rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                    />
                    {locSetores.length > 1 && (
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => setLocSetores(locSetores.filter((_, i) => i !== idx))}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-outline"
                  style={{ marginTop: '0.45rem' }}
                  onClick={() => setLocSetores([...locSetores, { nome: '', capacidade: 500 }])}
                >
                  + Adicionar Setor
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn-primary" disabled={processando} onClick={handleSalvarLocal}>
                  {locId ? 'Salvar Alterações' : 'Cadastrar Local'}
                </button>
                {locId && (
                  <button type="button" className="btn-outline" onClick={limparFormLocal}>
                    Novo Local
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Local</th>
                  <th>Cidade/UF</th>
                  <th>Capacidade</th>
                  <th>Setores</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(locaisMap).map(([id, l]) => {
                  const ativo = l.ativo !== false;
                  const setores = Array.isArray(l.setores) ? (l.setores as Array<Record<string, unknown>>) : [];
                  return (
                    <tr key={id}>
                      <td><code>{id}</code></td>
                      <td><strong>{String(l.nome || id)}</strong></td>
                      <td>{String(l.cidade || '')}/{String(l.uf || '')}</td>
                      <td>{Number(l.capacidadeTotal || 0).toLocaleString('pt-BR')}</td>
                      <td>{setores.map(s => `${s.nome} (${s.capacidade})`).join(', ')}</td>
                      <td>
                        <span className={`badge ${ativo ? 'badge-success' : 'badge-danger'}`}>
                          {ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: '0.35rem' }}>
                        <button type="button" className="btn-outline" onClick={() => editarLocal(id, l)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => solicitarAlterarStatus('local', id, String(l.nome || id), ativo)}
                        >
                          {ativo ? 'Inativar' : 'Reativar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {abaAtiva === 'eventos' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.25rem' }}>
          <div style={{ padding: '1rem', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', color: '#f8fafc' }}>
              {evId ? `Editar Evento (${evId})` : 'Novo Evento'}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                Nome do Evento
                <input
                  type="text"
                  value={evNome}
                  onChange={e => setEvNome(e.target.value)}
                  placeholder="Ex.: Festival de Inverno 2026"
                  style={{ width: '100%', marginTop: '0.25rem', padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                />
              </label>
              <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                Data do Evento (YYYY-MM-DD)
                <input
                  type="date"
                  value={evData}
                  onChange={e => setEvData(e.target.value)}
                  style={{ width: '100%', marginTop: '0.25rem', padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                />
              </label>
              <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                Produtora Dona {evId ? '(imutável após criação)' : ''}
                <select
                  value={evProdutoraId}
                  disabled={Boolean(evId)}
                  onChange={e => setEvProdutoraId(e.target.value)}
                  style={{ width: '100%', marginTop: '0.25rem', padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                >
                  <option value="">Selecione...</option>
                  {Object.entries(produtorasMap).map(([id, p]) => (
                    <option key={id} value={id}>
                      {String(p.nome || id)} ({id})
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                Local {localEvTravado ? '(bloqueado: já existem vendas/repasses)' : ''}
                <select
                  value={evLocalId}
                  disabled={localEvTravado}
                  onChange={e => setEvLocalId(e.target.value)}
                  style={{ width: '100%', marginTop: '0.25rem', padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                >
                  <option value="">Selecione...</option>
                  {Object.entries(locaisMap).map(([id, l]) => (
                    <option key={id} value={id}>
                      {String(l.nome || id)} ({id})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                Modo de Capacidade
                <select
                  value={evModoCap}
                  onChange={e => setEvModoCap(e.target.value as 'local' | 'setores' | 'manual')}
                  style={{ width: '100%', marginTop: '0.25rem', padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                >
                  <option value="local">Capacidade total do local</option>
                  <option value="setores">Soma de setores abertos</option>
                  <option value="manual">Capacidade manual</option>
                </select>
              </label>

              {evModoCap === 'setores' && (
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span>Setores Abertos:</span>
                  {setoresDoLocalSelecionado.map(st => {
                    const nomeSt = String(st.nome || '');
                    const marcado = evSetoresAbertos.includes(nomeSt);
                    return (
                      <label key={nomeSt} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={e => {
                            if (e.target.checked) setEvSetoresAbertos([...evSetoresAbertos, nomeSt]);
                            else setEvSetoresAbertos(evSetoresAbertos.filter(s => s !== nomeSt));
                          }}
                        />
                        {nomeSt} ({Number(st.capacidade || 0)})
                      </label>
                    );
                  })}
                </div>
              )}

              {evModoCap === 'manual' && (
                <label style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                  Capacidade Manual
                  <input
                    type="number"
                    value={evCapManual}
                    onChange={e => setEvCapManual(e.target.value)}
                    style={{ width: '100%', marginTop: '0.25rem', padding: '0.45rem', borderRadius: '0.375rem', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
                  />
                </label>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={evContarCortesias}
                  onChange={e => setEvContarCortesias(e.target.checked)}
                />
                Contabilizar cortesias no teto de capacidade
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={evLiberado}
                  onChange={e => setEvLiberado(e.target.checked)}
                />
                Liberado para solicitação de repasse pelo produtor
              </label>

              {eventoEmEdicao && (
                <div style={{ padding: '0.6rem', background: '#1e293b', borderRadius: '0.5rem', fontSize: '0.76rem', color: '#94a3b8' }}>
                  <strong>Estado Financeiro (somente leitura — preservado em transação):</strong>{' '}
                  Vendidos: {Number(vendasEvEdicao.vendidos || 0)} | Cortesias: {Number(vendasEvEdicao.cortesias || 0)} | Já Repassado:{' '}
                  {formatBRL(Number(eventoEmEdicao.jaRepassado || 0))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn-primary" disabled={processando} onClick={handleSalvarEvento}>
                  {evId ? 'Salvar Alterações' : 'Cadastrar Evento'}
                </button>
                {evId && (
                  <button type="button" className="btn-outline" onClick={limparFormEvento}>
                    Novo Evento
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Evento / Data</th>
                  <th>Produtora / Local</th>
                  <th>Vendidos</th>
                  <th>Já Repassado</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(eventosMap).map(([id, ev]) => {
                  const ativo = ev.ativo !== false;
                  const vendas = (ev.vendas || {}) as Record<string, unknown>;
                  return (
                    <tr key={id}>
                      <td><code>{id}</code></td>
                      <td>
                        <strong>{String(ev.nome || id)}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{String(ev.data || '')}</div>
                      </td>
                      <td>
                        <div><code>{String(ev.produtoraId || '')}</code></div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}><code>{String(ev.localId || '')}</code></div>
                      </td>
                      <td>{Number(vendas.vendidos || 0)} (+{Number(vendas.cortesias || 0)} cort.)</td>
                      <td>{formatBRL(Number(ev.jaRepassado || 0))}</td>
                      <td>
                        <span className={`badge ${ativo ? 'badge-success' : 'badge-danger'}`}>
                          {ativo ? (ev.liberadoParaSolicitacao ? 'Ativo / Liberado' : 'Ativo / Bloqueado') : 'Inativo'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: '0.35rem' }}>
                        <button type="button" className="btn-outline" onClick={() => editarEvento(id, ev)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => solicitarAlterarStatus('evento', id, String(ev.nome || id), ativo)}
                        >
                          {ativo ? 'Inativar' : 'Reativar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export const cadastroModule: FinancialModulePlugin = {
  id: 'cadastro',
  title: 'Cadastro Mestre',
  description: 'Produtoras, locais e eventos com reserva atômica de CNPJ e preservação transacional de vendas e repasses.',
  rtdbNode: '/produtoras',
  requiresJavaService: false,
  render: dados => <ModuloCadastroPainel dados={dados} />
};
