import type { DeskSnapshot } from '../engine/engine';
import { fmtExpiry, fmtNum, fmtSignedUsd, fmtTime } from '../lib/format';
import { Panel } from './ui';

const actionTone: Record<string, string> = { OPEN: 'text-cyan', CLOSE: 'text-dim', EXPIRY: 'text-warn', LIQ: 'text-white bg-down/80 px-1 rounded-sm' };

export function TradeBlotter({ s }: { s: DeskSnapshot }) {
  return (
    <Panel title="Trade Blotter (Live)" right={<span className="num text-[10px] text-muted">{s.exec.fills} fills · taker · Binance/Deribit fee caps</span>} bodyClass="p-0">
      <div className="scroll-thin h-[210px] overflow-auto">
        <table className="num w-full min-w-[720px] text-[10.5px]">
          <thead className="sticky top-0 bg-panel2 text-[9.5px] uppercase tracking-wider text-muted">
            <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:font-semibold">
              <th className="text-left">Time (UTC)</th>
              <th className="text-left">Strategy</th>
              <th>Side</th>
              <th className="text-left">Instrument</th>
              <th className="text-right">Size</th>
              <th className="text-right">Price</th>
              <th className="text-right">Slip</th>
              <th className="text-right">Fee</th>
              <th>Venue</th>
              <th className="text-right">P&L</th>
              <th className="text-left">Act</th>
            </tr>
          </thead>
          <tbody>
            {s.fills.map((f, i) => (
              <tr key={`${f.time}-${i}`} className={`border-t border-line/60 [&>td]:px-2 [&>td]:py-[3px] ${f.action === 'LIQ' ? 'bg-down/10' : ''}`}>
                <td className="text-dim">{fmtTime(f.time)}</td>
                <td className="max-w-[140px] truncate font-sans text-white">{f.strategyLabel}</td>
                <td className={`text-center font-semibold ${f.side === 'B' ? 'text-up' : 'text-down'}`}>{f.side}</td>
                <td className="text-dim">{fmtExpiry(f.expiry)} {f.strike}{f.type}</td>
                <td className="text-right">{fmtNum(f.qty, f.qty < 1 ? 2 : 1)}</td>
                <td className="text-right text-white">{fmtNum(f.price, f.price < 10 ? 2 : f.price < 100 ? 1 : 0)}</td>
                <td className={`text-right ${f.slippageBp > 50 ? 'text-warn' : 'text-muted'}`}>{f.action === 'EXPIRY' ? '' : `${f.slippageBp.toFixed(0)}bp`}</td>
                <td className="text-right text-warn">{f.fee.toFixed(2)}</td>
                <td className="text-center text-[9.5px] text-dim">{f.venue}</td>
                <td className={`text-right ${f.pnl === null ? 'text-muted' : f.pnl >= 0 ? 'text-up' : 'text-down'}`}>{f.pnl === null ? '—' : fmtSignedUsd(f.pnl, 1)}</td>
                <td><span className={`text-[9.5px] font-semibold ${actionTone[f.action]}`}>{f.action}</span> <span className="text-[9px] text-muted">{f.strategyTag}</span></td>
              </tr>
            ))}
            {!s.fills.length && (
              <tr>
                <td colSpan={11} className="py-8 text-center font-sans text-muted">Waiting for first signal…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
