import type { DeskSnapshot } from '../engine/engine';
import { ASSET_LIST } from '../engine/config';
import type { Regime } from '../engine/types';
import { Panel } from './ui';

const COLS: { key: Regime; label: string; rgb: string }[] = [
  { key: 'BULL', label: 'שורי', rgb: '31,214,154' },
  { key: 'NEUTRAL', label: 'ניטרלי', rgb: '120,140,160' },
  { key: 'BEAR', label: 'דובי', rgb: '255,77,94' },
  { key: 'EXTREME', label: 'קיצוני', rgb: '255,40,60' },
];

export function RegimePanel({ s }: { s: DeskSnapshot }) {
  return (
    <Panel title="מנוע משטרי שוק רב-נכסי" right={<span className="num text-[10px] text-muted">ביטחון {(s.regime.confidence * 100).toFixed(0)}%</span>}>
      <div className="mb-1.5 text-[10px] text-dim">מפת חום הסתברויות משטר · מומנטום / תנודתיות / זרם חיסולים / מימון</div>
      <table className="w-full border-separate border-spacing-[2px] text-[11px]">
        <thead>
          <tr className="text-[9.5px] uppercase tracking-wider text-muted">
            <th className="text-start font-semibold">נכס</th>
            {COLS.map((c) => (
              <th key={c.key} className="font-semibold">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ASSET_LIST.map((a) => {
            const p = s.regime.probs[a];
            const call = s.regime.call[a];
            return (
              <tr key={a}>
                <td className="font-semibold text-white">{a}</td>
                {COLS.map((c) => (
                  <td
                    key={c.key}
                    className={`num rounded-[2px] py-1 text-center font-semibold text-white ${call === c.key ? 'ring-1 ring-white/50' : ''}`}
                    style={{ background: `rgba(${c.rgb},${0.12 + p[c.key] * 0.85})` }}
                  >
                    {p[c.key].toFixed(2)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
