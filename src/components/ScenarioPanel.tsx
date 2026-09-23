import type { DeskSnapshot } from '../engine/engine';
import { fmtCompactUsd, fmtNum } from '../lib/format';
import { Panel } from './ui';

export function ScenarioPanel({ s }: { s: DeskSnapshot }) {
  const { spotMoves, ivShifts, grid } = s.scenario;
  const eq = Math.max(1, s.account.equity);
  const cell = (v: number) => {
    const t = Math.min(1, Math.abs(v) / (eq * 0.5));
    return v >= 0 ? `rgba(31,214,154,${0.1 + t * 0.6})` : `rgba(255,77,94,${0.1 + t * 0.7})`;
  };
  return (
    <Panel title="ניתוח תרחישים (מה-אם)" right={<span className="num text-[10px] text-muted">BTC {fmtNum(s.assets.BTC.spot, 0)} · זעזוע β ‏ETH 1.2 SOL 1.5</span>}>
      <table className="num w-full border-separate border-spacing-[2px] text-[10.5px]">
        <thead>
          <tr className="text-[9.5px] uppercase text-muted">
            <th className="text-start font-semibold">IV \ מחיר</th>
            {spotMoves.map((m) => (
              <th key={m} className="font-semibold">{m > 0 ? '+' : ''}{(m * 100).toFixed(0)}%</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ivShifts.map((iv, i) => (
            <tr key={iv}>
              <td className="text-[9.5px] font-semibold text-muted">{iv > 0 ? '+' : ''}{(iv * 100).toFixed(0)}v</td>
              {grid[i].map((v, j) => (
                <td key={j} className={`rounded-[2px] py-1 text-center font-semibold text-white ${iv === 0 && spotMoves[j] === 0 ? 'ring-1 ring-white/40' : ''}`} style={{ background: cell(v) }}>
                  {Math.abs(v) < 0.5 ? '0' : fmtCompactUsd(v, true)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 text-[9.5px] text-muted">שערוך BS מלא לכל רגל · % מההון: הגרוע ביותר {((Math.min(...grid.flat()) / eq) * 100).toFixed(0)}%</div>
    </Panel>
  );
}
