import type { DeskSnapshot } from '../engine/engine';
import { fmtUsd } from '../lib/format';
import { Dot, Panel, Row } from './ui';

export function ExecutionQuality({ s }: { s: DeskSnapshot }) {
  const e = s.exec;
  return (
    <Panel title="איכות ביצוע">
      <Row label="החלקה ממוצעת מול ציטוט" value={`${e.avgSlipBp.toFixed(1)} bp`} tone={e.avgSlipBp > 100 ? 'text-warn' : 'text-text'} />
      <Row label="שיעור מילוי" value={`${(e.fillRate * 100).toFixed(1)}%`} />
      <Row label="השהיה ממוצעת" value={`${e.avgLatency.toFixed(1)} ms`} />
      <Row label="השהיה אחרונה" value={`${e.lastLatency.toFixed(1)} ms`} tone={e.lastLatency > 100 ? 'text-down' : 'text-text'} />
      <Row label="שיעור דחיות" value={`${(e.rejectRate * 100).toFixed(2)}%`} tone={e.rejectRate > 0.03 ? 'text-down' : 'text-text'} />
      <Row label="עמלות (מילויים)" value={`${fmtUsd(e.fees, 2)} · ${e.fills}`} tone="text-warn" />
    </Panel>
  );
}

export function SystemHealth({ s }: { s: DeskSnapshot }) {
  const tripped = s.system.circuit === 'TRIPPED';
  const items: [string, string, string][] = [
    ['פיד נתונים', 'תקין', 'text-up'],
    ['מנוע מודל', `תקין ${(s.regime.confidence * 100).toFixed(0)}%`, 'text-up'],
    ['מנוע סיכונים', s.account.marginRatio > 0.85 ? 'מרג׳ין קול' : 'תקין', s.account.marginRatio > 0.85 ? 'text-down' : 'text-up'],
    ['קישוריות', 'תקין', 'text-up'],
  ];
  return (
    <Panel title="בריאות מערכת">
      {items.map(([k, v, t]) => (
        <div key={k} className="flex items-center justify-between py-[3px] text-[11px]">
          <span className="flex items-center gap-1.5 text-dim"><Dot tone={t === 'text-up' ? 'bg-up' : 'bg-down'} pulse={t !== 'text-up'} /> {k}</span>
          <span className={`num font-semibold ${t}`}>{v}</span>
        </div>
      ))}
      <div className="flex items-center justify-between py-[3px] text-[11px]">
        <span className="flex items-center gap-1.5 text-dim"><Dot tone={tripped ? 'bg-down' : 'bg-warn'} pulse={tripped} /> מפסק זרם</span>
        <span className={`num font-semibold ${tripped ? 'text-down' : 'text-warn'}`}>{tripped ? `הופעל ${s.system.circuitMinutesLeft.toFixed(0)} דק׳` : 'דרוך'}</span>
      </div>
      <div className="flex items-center justify-between py-[3px] text-[11px]">
        <span className="flex items-center gap-1.5 text-dim"><Dot tone="bg-cyan" /> שומר השהיה</span>
        <span className="num font-semibold text-cyan">{s.system.latencyGuardMs}ms</span>
      </div>
    </Panel>
  );
}
