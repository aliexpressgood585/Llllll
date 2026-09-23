import type { DeskSnapshot } from '../engine/engine';
import { fmtTime } from '../lib/format';
import { Panel, sevLabel, sevTone } from './ui';

export function AlertFeed({ s }: { s: DeskSnapshot }) {
  const conf = s.regime.confidence;
  return (
    <Panel title="התראות וביטחון המודל" bodyClass="p-0 flex flex-col">
      <div className="scroll-thin h-[170px] overflow-auto px-2.5 py-1">
        {s.alerts.map((a) => (
          <div key={a.id} className={`flex items-start gap-2 border-b border-line/50 py-1 text-[10.5px] ${a.severity === 'CRITICAL' && s.now - a.time < 30 * 60e3 ? 'flash-red' : ''}`}>
            <span className="num shrink-0 text-muted">{fmtTime(a.time)}</span>
            <span className="min-w-0 flex-1 text-text">{a.text}</span>
            <span className={`shrink-0 text-[9.5px] font-bold ${sevTone[a.severity]}`}>{sevLabel[a.severity]}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-line px-2.5 py-2">
        <div className="text-[9.5px] font-semibold uppercase tracking-wider text-muted">ביטחון המודל</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="num text-[17px] font-semibold text-white">{(conf * 100).toFixed(1)}%</span>
          <div className="h-2 flex-1 overflow-hidden rounded-sm bg-line">
            <div className="h-full bg-gradient-to-r from-cyan to-accent" style={{ width: `${conf * 100}%` }} />
          </div>
          <span className="text-[9.5px] text-muted">(שיעור פגיעה 24 שעות)</span>
        </div>
      </div>
    </Panel>
  );
}
