import type { DeskSnapshot } from '../engine/engine';
import { fmtUsd } from '../lib/format';
import { Panel, Tile } from './ui';

export function RiskDashboard({ s }: { s: DeskSnapshot }) {
  const r = s.risk;
  const eq = Math.max(1, s.account.equity);
  const pct = (v: number) => `${((v / eq) * 100).toFixed(1)}% of equity`;
  const util = s.account.marginUtil;
  return (
    <Panel title="Risk Dashboard" right={<span className="num text-[10px] text-muted">MC 300 paths · full reval</span>}>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
        <Tile label="VaR 1-Day 95%" value={fmtUsd(r.var95)} sub={pct(r.var95)} tone={r.var95 / eq > 0.25 ? 'text-down' : 'text-accent'} />
        <Tile label="Expected Shortfall 95%" value={fmtUsd(r.es95)} sub={pct(r.es95)} tone={r.es95 / eq > 0.35 ? 'text-down' : 'text-white'} />
        <Tile label="Capital at Risk (±20%)" value={fmtUsd(r.capitalAtRisk)} sub={pct(r.capitalAtRisk)} tone={r.capitalAtRisk / eq > 0.5 ? 'text-down' : 'text-white'} />
        <Tile label="Margin Utilization" value={`${(util * 100).toFixed(1)}%`} sub={`IM ${fmtUsd(r.im)} / ${fmtUsd(s.account.equity)}`} tone={util > 0.85 ? 'text-down' : util > 0.6 ? 'text-warn' : 'text-white'} />
        <Tile label="IM Increase (Stress)" value={`${r.imIncrease >= 0 ? '+' : ''}${fmtUsd(r.imIncrease)}`} sub="BTC −15% · IV +25v" tone={r.imIncrease > 0 ? 'text-down' : 'text-up'} />
        <Tile label="Available Margin" value={fmtUsd(s.account.available)} sub={`fees paid ${fmtUsd(s.account.fees)}`} tone={s.account.available < 0 ? 'text-down' : 'text-up'} />
      </div>
    </Panel>
  );
}
