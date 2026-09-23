import type { DeskSnapshot } from '../engine/engine';
import { fmtCompactUsd, fmtNum, fmtSignedUsd } from '../lib/format';
import { Panel, Tile } from './ui';

export function GreeksSummary({ s }: { s: DeskSnapshot }) {
  const g = s.greeks;
  const t = (v: number) => (v >= 0 ? 'text-up' : 'text-down');
  return (
    <Panel title="Portfolio Greeks Summary (Net)" right={<span className="num text-[10px] text-muted">BTC-equiv · $ greeks</span>}>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 2xl:grid-cols-6">
        <Tile label="Net Delta" value={`${g.deltaBtc >= 0 ? '+' : ''}${fmtNum(g.deltaBtc, 3)} BTC`} sub={fmtSignedUsd(g.deltaUsd)} tone={t(g.deltaBtc)} />
        <Tile label="Net Gamma (1%)" value={fmtSignedUsd(g.gammaUsd, 0)} sub="Δ$ per 1% move" tone={t(g.gammaUsd)} />
        <Tile label="Net Vega" value={fmtSignedUsd(g.vega, 1)} sub="per vol pt" tone={t(g.vega)} />
        <Tile label="Net Theta" value={fmtSignedUsd(g.theta, 1)} sub="per day" tone={t(g.theta)} />
        <Tile label="Rho (USD)" value={fmtSignedUsd(g.rho, 2)} sub="per 1% rate" tone={t(g.rho)} />
        <Tile label="Vega Notional" value={fmtCompactUsd(g.vegaNotional)} sub="gross |vega|×100" tone="text-white" />
      </div>
    </Panel>
  );
}
