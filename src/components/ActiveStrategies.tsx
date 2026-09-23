import type { DeskSnapshot } from '../engine/engine';
import { STRATEGY_COLORS } from '../engine/config';
import { fmtNum, fmtSignedUsd } from '../lib/format';
import { Panel } from './ui';

export function ActiveStrategies({ s }: { s: DeskSnapshot }) {
  return (
    <Panel title="Active Multi-Leg Strategies" right={<span className="num text-[10px] text-muted">{s.strategies.length} live</span>} bodyClass="p-0 flex flex-col">
      <div className="scroll-thin max-h-[236px] flex-1 overflow-auto">
        <table className="num w-full text-[10.5px]">
          <thead className="sticky top-0 bg-panel2 text-[9.5px] uppercase tracking-wider text-muted">
            <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:font-semibold">
              <th className="text-left">Strategy</th>
              <th>Legs</th>
              <th className="text-right">Size</th>
              <th className="text-right">P&L (Live)</th>
              <th className="text-right">Θ/Day</th>
              <th className="text-right">Vega</th>
            </tr>
          </thead>
          <tbody>
            {s.strategies.map((v) => {
              const prog = v.pnl >= 0 ? Math.min(1, v.pnl / v.tp) : Math.min(1, v.pnl / v.sl);
              return (
                <tr key={v.id} className="border-t border-line/60 [&>td]:px-2 [&>td]:py-1.5" title={`${v.note} · TP ${fmtSignedUsd(v.tp, 0)} / SL ${fmtSignedUsd(v.sl, 0)}`}>
                  <td className="text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="h-5 w-1 shrink-0 rounded-sm" style={{ background: STRATEGY_COLORS[v.kind] }} />
                      <div className="min-w-0">
                        <div className="truncate font-sans font-semibold text-white">{v.label}</div>
                        <div className="truncate text-[9px] text-muted">
                          {v.tag} · {v.ageHours.toFixed(1)}h · TP <span className="text-up">{fmtSignedUsd(v.tp, 0)}</span> SL <span className="text-down">{fmtSignedUsd(v.sl, 0)}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="text-center text-dim">{v.legs}</td>
                  <td className="text-right text-dim">{fmtNum(v.size, v.size < 1 ? 2 : 1)}</td>
                  <td className={`text-right font-semibold ${v.pnl >= 0 ? 'text-up' : 'text-down'}`}>
                    {fmtSignedUsd(v.pnl, 0)} <span className="text-[9.5px] font-normal">({(v.pnlPct * 100).toFixed(0)}%)</span>
                    <div className="mt-0.5 ml-auto h-[3px] w-16 overflow-hidden rounded bg-line">
                      <div className={`h-full ${v.pnl >= 0 ? 'bg-up' : 'bg-down'}`} style={{ width: `${Math.max(0, prog) * 100}%` }} />
                    </div>
                  </td>
                  <td className={`text-right ${v.theta >= 0 ? 'text-up' : 'text-down'}`}>{fmtSignedUsd(v.theta, 1)}</td>
                  <td className={`text-right ${v.vega >= 0 ? 'text-up' : 'text-down'}`}>{fmtSignedUsd(v.vega, 1)}</td>
                </tr>
              );
            })}
            {!s.strategies.length && (
              <tr>
                <td colSpan={6} className="py-6 text-center font-sans text-muted">{s.blowup.active ? 'Account liquidated — awaiting re-fund' : 'Scanning for entries…'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-2 py-1 text-[9.5px] text-muted">P&L attribution vs. live marks · incl. fees & slippage · bar = progress to TP/SL</div>
    </Panel>
  );
}
