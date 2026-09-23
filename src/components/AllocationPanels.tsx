import type { DeskSnapshot } from '../engine/engine';
import { STRATEGY_COLORS, STRATEGY_NAMES } from '../engine/config';
import { fmtSigned, fmtUsd } from '../lib/format';
import { Panel } from './ui';

export function StrategyAllocation({ s }: { s: DeskSnapshot }) {
  const items = s.allocation.filter((a) => a.margin > 0);
  const free = Math.max(0, s.account.equity - items.reduce((a, b) => a + b.margin, 0));
  const all = [...items.map((i) => ({ label: STRATEGY_NAMES[i.kind], v: i.margin, color: STRATEGY_COLORS[i.kind] })), { label: 'מזומן', v: free, color: '#3a4655' }];
  const tot = all.reduce((a, b) => a + b.v, 0) || 1;
  let acc = 0;
  const R = 38;
  const C = 2 * Math.PI * R;
  return (
    <Panel title="הקצאת אסטרטגיות" right={<span className="text-[10px] text-muted">משוקלל סיכון</span>}>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 100 100" className="h-[104px] w-[104px] shrink-0 -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="#18232f" strokeWidth="16" />
          {all.map((a) => {
            const frac = a.v / tot;
            const el = <circle key={a.label} cx="50" cy="50" r={R} fill="none" stroke={a.color} strokeWidth="16" strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-acc * C} />;
            acc += frac;
            return el;
          })}
        </svg>
        <div className="min-w-0 flex-1 space-y-1 text-[10.5px]">
          {all.map((a) => (
            <div key={a.label} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-dim">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: a.color }} />
                <span className="truncate">{a.label}</span>
              </span>
              <span className="num text-white">{((a.v / tot) * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export function GreekAllocation({ s }: { s: DeskSnapshot }) {
  const items = s.allocation;
  const max = Math.max(1, ...items.map((i) => Math.abs(i.vega)));
  return (
    <Panel title="סיכון יווני (וגה $)">
      <div className="space-y-1.5">
        {items.map((i) => (
          <div key={i.kind} className="grid grid-cols-[88px_1fr_52px] items-center gap-2 text-[10.5px]">
            <span className="truncate text-dim">{STRATEGY_NAMES[i.kind]}</span>
            <div className="relative h-2.5 rounded-sm bg-line">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line2" />
              <div
                className="absolute inset-y-0 rounded-sm"
                style={{
                  background: i.vega >= 0 ? '#1fd69a' : '#ff4d5e',
                  left: i.vega >= 0 ? '50%' : `${50 - (Math.abs(i.vega) / max) * 50}%`,
                  width: `${(Math.abs(i.vega) / max) * 50}%`,
                }}
              />
            </div>
            <span className={`num text-end ${i.vega >= 0 ? 'text-up' : 'text-down'}`}>{fmtSigned(i.vega, 1)}</span>
          </div>
        ))}
        {!items.length && <div className="py-3 text-center text-[10.5px] text-muted">ניטרלי — אין חשיפת וגה</div>}
        <div className="flex justify-between border-t border-line pt-1 text-[10.5px]">
          <span className="text-dim">וגה נטו</span>
          <span className={`num ${s.greeks.vega >= 0 ? 'text-up' : 'text-down'}`}>{fmtSigned(s.greeks.vega, 1)}</span>
        </div>
        <div className="flex justify-between text-[10.5px]">
          <span className="text-dim">סיכון מוקצה</span>
          <span className="num text-white">{fmtUsd(items.reduce((a, b) => a + b.margin, 0))}</span>
        </div>
      </div>
    </Panel>
  );
}
