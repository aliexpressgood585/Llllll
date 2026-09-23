import type { DeskSnapshot } from '../engine/engine';
import { fmtCompactUsd, fmtNum, fmtSignedUsd } from '../lib/format';
import { Panel, Tile } from './ui';

export function GreeksSummary({ s }: { s: DeskSnapshot }) {
  const g = s.greeks;
  const t = (v: number) => (v >= 0 ? 'text-up' : 'text-down');
  return (
    <Panel title="סיכום יווניות התיק (נטו)" right={<span className="num text-[10px] text-muted">שווה-ערך BTC · יווניות ב-$</span>}>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 2xl:grid-cols-6">
        <Tile label="דלתא נטו" value={`${g.deltaBtc >= 0 ? '+' : ''}${fmtNum(g.deltaBtc, 3)} BTC`} sub={fmtSignedUsd(g.deltaUsd)} tone={t(g.deltaBtc)} />
        <Tile label="גמא נטו (1%)" value={fmtSignedUsd(g.gammaUsd, 0)} sub="Δ$ לתנועה של 1%" tone={t(g.gammaUsd)} />
        <Tile label="וגה נטו" value={fmtSignedUsd(g.vega, 1)} sub="לנקודת תנודתיות" tone={t(g.vega)} />
        <Tile label="תטא נטו" value={fmtSignedUsd(g.theta, 1)} sub="ליום" tone={t(g.theta)} />
        <Tile label="רו (USD)" value={fmtSignedUsd(g.rho, 2)} sub="ל-1% ריבית" tone={t(g.rho)} />
        <Tile label="נוציונל וגה" value={fmtCompactUsd(g.vegaNotional)} sub="ברוטו |וגה|×100" tone="text-white" />
      </div>
    </Panel>
  );
}
