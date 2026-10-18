import React from 'react';
import { formatBRL } from './formatters';
import type { BorderoEventoLimpo } from './dadosProdutor';

export interface DonutSlice {
  label: string;
  v: number;
  color: string;
}

export function DonutChart({
  slices,
  centerTop,
  centerVal
}: {
  slices: DonutSlice[];
  centerTop: string;
  centerVal: string;
}) {
  const tot = slices.reduce((a, x) => a + Math.max(0, x.v), 0) || 1;
  let acc = 0;
  const stops = slices
    .map(x => {
      const a0 = (acc / tot) * 360;
      acc += Math.max(0, x.v);
      const a1 = (acc / tot) * 360;
      return `${x.color} ${a0.toFixed(1)}deg ${a1.toFixed(1)}deg`;
    })
    .join(', ');

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '24px' }}>
      <div
        style={{
          position: 'relative',
          width: '176px',
          height: '176px',
          borderRadius: '50%',
          background: `conic-gradient(${stops})`,
          flex: 'none'
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '26px',
            borderRadius: '50%',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '6px'
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#5a6584',
              textTransform: 'uppercase',
              letterSpacing: '.04em'
            }}
          >
            {centerTop}
          </span>
          <span className="num" style={{ fontSize: '14px', color: '#0f1b3d', marginTop: '2px' }}>
            {centerVal}
          </span>
        </div>
      </div>
      <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {slices.map(x => {
          const pct = Math.round((Math.max(0, x.v) / tot) * 100);
          return (
            <div key={x.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '14px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f1b3d', fontWeight: 600 }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: x.color, flex: 'none' }} />
                {x.label}
              </span>
              <span className="num" style={{ color: '#0f1b3d' }}>
                {formatBRL(x.v)} <span style={{ color: '#5a6584', fontWeight: 500 }}>({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StackedEventsChart({ eventos }: { eventos: BorderoEventoLimpo[] }) {
  const rows = eventos.map(e => ({
    e,
    rep: Math.max(0, e.jaRepassado),
    lib: Math.max(0, e.liberavel),
    ret: Math.max(0, e.retido),
    tot: Math.max(0, e.jaRepassado) + Math.max(0, e.liberavel) + Math.max(0, e.retido)
  }));
  const max = Math.max(1, ...rows.map(r => r.tot));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13px', fontWeight: 600, color: '#3d4766' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#2f55c4' }} />
          Já recebido
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#0f8a5f' }} />
          Liberável
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#e0661b' }} />
          Retido
        </span>
      </div>
      {rows.map(r => {
        const wRep = (r.rep / max) * 100;
        const wLib = (r.lib / max) * 100;
        const wRet = (r.ret / max) * 100;
        return (
          <div key={r.e.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '14px' }}>
              <span style={{ fontWeight: 700, color: '#0f1b3d' }}>{r.e.nome}</span>
              <span className="num" style={{ color: '#3d4766' }}>{formatBRL(r.tot)}</span>
            </div>
            <div style={{ display: 'flex', height: '20px', background: '#eef1f7', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ width: `${wRep}%`, background: '#2f55c4' }} title={`Já recebido: ${formatBRL(r.rep)}`} />
              <div style={{ width: `${wLib}%`, background: '#0f8a5f' }} title={`Liberável: ${formatBRL(r.lib)}`} />
              <div style={{ width: `${wRet}%`, background: '#e0661b' }} title={`Retido: ${formatBRL(r.ret)}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WaterfallChart({ ev }: { ev: BorderoEventoLimpo }) {
  const retTot = ev.retencoes.reduce((a, r) => a + r.valor, 0);
  const opsTot = ev.descontosOperacionais.reduce((a, d) => a + d.valor, 0);
  const cred = (ev.rebate || 0) + (ev.patrocinio || 0);
  const pago = (ev.jaRepassado || 0) + (ev.advEv || 0) + (ev.antEv || 0);

  const steps: Array<{ label: string; v: number; kind: 'tot' | 'sub' | 'add' | 'end' }> = [
    { label: 'Borderô do evento', v: ev.borderoEvento, kind: 'tot' },
    { label: '(−) Despesas pagas', v: -ev.despesas, kind: 'sub' },
    { label: '(−) Retenções', v: -retTot, kind: 'sub' },
    { label: '(−) Descontos operacionais', v: -opsTot, kind: 'sub' },
    { label: 'Resultado do evento', v: ev.resultado, kind: 'tot' }
  ];
  if (cred > 0) {
    steps.push({ label: '(+) Rebate e patrocínio', v: cred, kind: 'add' });
  }
  steps.push(
    { label: '(−) Retido pelas travas', v: -ev.retido, kind: 'sub' },
    { label: '(−) Já recebido / antecipado', v: -pago, kind: 'sub' },
    { label: 'Liberável agora', v: ev.liberavel, kind: 'end' }
  );

  const max = Math.max(1, ev.borderoEvento, ev.resultado + cred);
  let run = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {steps.map(st => {
        let left = 0;
        let width = 0;
        let color = '#1e3a8a';
        if (st.kind === 'tot' || st.kind === 'end') {
          run = st.v;
          left = 0;
          width = (Math.max(0, st.v) / max) * 100;
          color = st.kind === 'end' ? '#0f8a5f' : '#1e3a8a';
        } else if (st.v < 0) {
          const next = run + st.v;
          left = (Math.max(0, next) / max) * 100;
          width = (Math.abs(st.v) / max) * 100;
          run = next;
          color = '#c2307a';
        } else {
          left = (Math.max(0, run) / max) * 100;
          width = (st.v / max) * 100;
          run += st.v;
          color = '#0f8a5f';
        }

        const bold = st.kind === 'tot' || st.kind === 'end';
        return (
          <div key={st.label} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
            <span style={{ flex: '1 1 200px', fontWeight: bold ? 800 : 600, color: '#0f1b3d' }}>{st.label}</span>
            <div style={{ flex: '2 1 240px', position: 'relative', height: '18px', background: '#eef1f7', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${Math.min(100, left)}%`,
                  width: `${Math.max(1, Math.min(100 - left, width))}%`,
                  background: color,
                  borderRadius: '4px'
                }}
              />
            </div>
            <span
              className="num"
              style={{
                flex: '0 0 130px',
                textAlign: 'right',
                fontWeight: bold ? 800 : 600,
                color: st.v < 0 ? '#b91c1c' : st.kind === 'end' ? '#065f46' : '#0f1b3d'
              }}
            >
              {formatBRL(st.v)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function SearchIconSvg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function ModuleIconSvg({ id }: { id: string }): React.ReactElement {
  switch (id) {
    case 'saldo':
    case 'saldos':
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 15h4" />
        </svg>
      );
    case 'repasses':
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 17L17 7M17 7H8M17 7v9" />
        </svg>
      );
    case 'contas':
    case 'contas-pagar':
    case 'contas-receber':
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18" />
        </svg>
      );
    case 'antecipacoes':
    case 'advanced':
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case 'despesas':
    default:
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h5" />
        </svg>
      );
  }
}
