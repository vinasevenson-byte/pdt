export interface ConfigModalDecisao {
  aberto?: boolean;
  titulo: string;
  subtitulo: string;
  exigeMotivo?: boolean;
  exigirMotivo?: boolean;
  labelMotivo?: string;
  placeholderMotivo?: string;
  exigeProtocolo?: boolean;
  labelProtocolo?: string;
  labelConfirmar?: string;
  textoConfirmar?: string;
  corBotao?: string;
  corConfirmar?: string;
  onConfirmar?: (dados: { motivo: string; protocolo: string }) => Promise<void> | void;
  onConfirm?: (dados: { motivo: string; protocolo: string }) => Promise<void> | void;
}

export function renderizarPainelDecisaoInline(
  modal: ConfigModalDecisao | null,
  valoresOuFechar: { motivo: string; protocolo: string } | (() => void),
  onChange?: (novos: { motivo: string; protocolo: string }) => void,
  onFechar?: () => void
) {
  if (!modal || modal.aberto === false) return null;

  const fecharFn = typeof valoresOuFechar === 'function' ? valoresOuFechar : onFechar || (() => {});
  const valores = typeof valoresOuFechar === 'function' ? { motivo: '', protocolo: '' } : valoresOuFechar;
  const changeFn = onChange || (() => {});
  const pedirMotivo = Boolean(modal.exigeMotivo ?? modal.exigirMotivo ?? true);
  const corFinal =
    modal.corBotao ||
    (modal.corConfirmar === 'danger' ? '#b91c1c' : modal.corConfirmar) ||
    '#1d4ed8';
  const textoBtn = modal.labelConfirmar || modal.textoConfirmar || 'Confirmar';
  const callbackConfirmar = modal.onConfirmar || modal.onConfirm;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={modal.titulo}
      style={{
        background: '#f8fafc',
        border: '2px solid #cbd5e1',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong style={{ fontSize: '15px', color: '#0f172a' }}>{modal.titulo}</strong>
          <div style={{ fontSize: '13px', color: '#475569' }}>{modal.subtitulo}</div>
        </div>
        <button
          type="button"
          onClick={fecharFn}
          style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}
        >
          Cancelar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        {pedirMotivo && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
            {modal.labelMotivo || 'Motivo (mínimo 3 caracteres)'}
            <input
              type="text"
              value={valores.motivo}
              onChange={e => changeFn({ ...valores, motivo: e.target.value })}
              placeholder={modal.placeholderMotivo || 'Descreva o motivo para auditoria'}
              style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #94a3b8' }}
            />
          </label>
        )}

        {modal.exigeProtocolo && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600 }}>
            {modal.labelProtocolo || 'Protocolo Bancário'}
            <input
              type="text"
              value={valores.protocolo}
              onChange={e => changeFn({ ...valores, protocolo: e.target.value })}
              placeholder="Ex.: DEV-TED-20261026-001"
              style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #94a3b8' }}
            />
          </label>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          type="button"
          onClick={async () => {
            if (callbackConfirmar) await callbackConfirmar(valores);
            fecharFn();
          }}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: 0,
            background: corFinal,
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          {textoBtn}
        </button>
      </div>
    </div>
  );
}
