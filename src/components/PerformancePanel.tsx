import type { DeskSnapshot } from '../engine/engine';
import { STRATEGY_COLORS, STRATEGY_NAMES } from '../engine/config';
import { fmtSignedUsd, fmtUsd } from '../lib/format';
import { Panel, Row } from './ui';

export function PerformancePanel({ s }: { s: DeskSnapshot }) {
  const a = s.account;
  const winRate = a.trades ? a.wins / a.trades : 0;
  const ks = [...s.kindStats].sort((x, y) => y.pnl - x.pnl);
  return (
    <Panel title="ביצועי הדסק" right={<span className="num text-[10px] text-muted">חשבון #{s.attempt}</span>}>
      <div className="grid grid-cols-2 gap-x-4">
        <Row label="עסקאות סגורות" value={a.trades} />
        <Row label="אחוז הצלחה" value={`${(winRate * 100).toFixed(0)}%`} tone={winRate >= 0.5 ? 'text-up' : 'text-warn'} />
        <Row label="רו״ה ממומש" value={fmtSignedUsd(a.realized)} tone={a.realized >= 0 ? 'text-up' : 'text-down'} />
        <Row label="עמלות + עמלות חיסול" value={fmtUsd(a.fees, 2)} tone="text-warn" />
      </div>
      <table className="num mt-2 w-full text-[10.5px]">
        <thead className="text-[9.5px] uppercase tracking-wider text-muted">
          <tr>
            <th className="text-start font-semibold">אסטרטגיה</th>
            <th className="text-end font-semibold">N</th>
            <th className="text-end font-semibold">הצלחה%</th>
            <th className="text-end font-semibold">רו״ה</th>
          </tr>
        </thead>
        <tbody>
          {ks.map((k) => (
            <tr key={k.kind} className="border-t border-line/60">
              <td className="py-[3px] font-sans text-dim">
                <span className="me-1.5 inline-block h-2 w-2 rounded-sm" style={{ background: STRATEGY_COLORS[k.kind] }} />
                {STRATEGY_NAMES[k.kind]}
              </td>
              <td className="text-end text-dim">{k.n}</td>
              <td className="text-end text-dim">{((k.wins / Math.max(1, k.n)) * 100).toFixed(0)}%</td>
              <td className={`text-end ${k.pnl >= 0 ? 'text-up' : 'text-down'}`}>{fmtSignedUsd(k.pnl)}</td>
            </tr>
          ))}
          {!ks.length && (
            <tr>
              <td colSpan={4} className="py-2 text-center font-sans text-muted">אין עדיין עסקאות סגורות</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-2 text-[9.5px] font-semibold uppercase tracking-wider text-muted">חשבונות שנמחקו</div>
      {s.attemptsLog.length ? (
        s.attemptsLog.slice(0, 4).map((x) => (
          <div key={x.attempt} className="num flex justify-between text-[10px] text-down">
            <span>#{x.attempt} · {x.hours.toFixed(1)} ש׳ · {x.cause}</span>
            <span>שיא {fmtUsd(x.peak)}</span>
          </div>
        ))
      ) : (
        <div className="text-[10px] text-muted">אין — חשבון #1 חי</div>
      )}
    </Panel>
  );
}
