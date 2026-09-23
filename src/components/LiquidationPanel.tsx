import { useState } from 'react';
import type { DeskSnapshot } from '../engine/engine';
import { ASSETS, ASSET_LIST } from '../engine/config';
import type { Asset } from '../engine/types';
import { useElementSize } from '../hooks/useElementSize';
import { fmtCompactUsd, fmtNum, fmtTime, fmtUsd } from '../lib/format';
import { Bar, Chip, Panel, Row } from './ui';

const RANGE = 0.12;

function Heatmap({ s, asset }: { s: DeskSnapshot; asset: Asset }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const a = s.assets[asset];
  const W = Math.max(10, size.width);
  const H = 132;
  const x = (p: number) => ((p / a.spot - 1 + RANGE) / (2 * RANGE)) * W;
  const maxN = Math.max(...a.clusters.map((c) => c.notional), 1);
  const labelled = new Set(
    (['LONG', 'SHORT'] as const).flatMap((side) =>
      a.clusters.filter((c) => c.side === side && Math.abs(c.price / a.spot - 1) < RANGE).sort((p, q) => q.notional - p.notional).slice(0, 2),
    ),
  );
  // density band: aggregate into buckets for a heat strip
  const buckets = 48;
  const heat = new Array(buckets).fill(0);
  for (const c of a.clusters) {
    const i = Math.floor(((c.price / a.spot - 1 + RANGE) / (2 * RANGE)) * buckets);
    if (i >= 0 && i < buckets) heat[i] += c.notional;
  }
  const maxHeat = Math.max(...heat, 1);
  const recent = s.marketLiqs.filter((e) => e.asset === asset && s.now - e.time < 6 * 3600e3);
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} className="block">
        {heat.map((h, i) => (
          <rect key={i} x={(i / buckets) * W} y={H - 16} width={W / buckets + 0.5} height={10} fill={i < buckets / 2 ? `rgba(255,77,94,${(h / maxHeat) * 0.9})` : `rgba(31,214,154,${(h / maxHeat) * 0.9})`} />
        ))}
        {[-0.1, -0.05, 0, 0.05, 0.1].map((m) => (
          <g key={m}>
            <line x1={x(a.spot * (1 + m))} x2={x(a.spot * (1 + m))} y1={0} y2={H - 18} stroke="#18232f" strokeDasharray="2 3" />
            <text x={x(a.spot * (1 + m)) + 2} y={H - 20} fontSize="9" fill="#5f6f82" fontFamily="JetBrains Mono, ui-monospace, monospace">{m === 0 ? '' : `${m > 0 ? '+' : ''}${m * 100}%`}</text>
          </g>
        ))}
        {a.clusters.map((c, i) => {
          const h = Math.max(3, (c.notional / maxN) * (H - 34));
          const cx = x(c.price);
          if (cx < 0 || cx > W) return null;
          const long = c.side === 'LONG';
          return (
            <g key={i}>
              <rect x={cx - 2.5} y={H - 20 - h} width={5} height={h} rx={1} fill={long ? '#ff4d5e' : '#1fd69a'} opacity={0.55 + 0.45 * (c.notional / maxN)}>
                <title>{`${c.side} liq @ ${fmtNum(c.price, ASSETS[asset].decimals)} · ${fmtCompactUsd(c.notional)} · ${c.leverage}x`}</title>
              </rect>
              {labelled.has(c) && (
                <text x={cx} y={H - 24 - h} fontSize="8.5" textAnchor="middle" fill={long ? '#ff8a95' : '#6ff0c4'} fontFamily="JetBrains Mono, ui-monospace, monospace">{fmtCompactUsd(c.notional)}</text>
              )}
            </g>
          );
        })}
        {recent.map((e, i) => (
          <circle key={i} cx={x(e.price)} cy={H - 11} r={Math.min(6, 2 + (e.notional / ASSETS[asset].liqDepthPer1Pct) * 4)} fill="none" stroke="#f5a524" strokeWidth={1} opacity={1 - (s.now - e.time) / (6 * 3600e3)} />
        ))}
        <line x1={W / 2} x2={W / 2} y1={0} y2={H - 4} stroke="#22d3ee" strokeWidth={1.5} />
        <text x={W / 2 + 4} y={34} fontSize="9.5" fill="#22d3ee" fontFamily="JetBrains Mono, ui-monospace, monospace">{fmtNum(a.spot, ASSETS[asset].decimals)}</text>
        <text x={4} y={22} fontSize="9" fill="#ff8a95" fontFamily="Inter, system-ui, sans-serif">◀ LONG LIQUIDATIONS</text>
        <text x={W - 4} y={22} fontSize="9" fill="#6ff0c4" textAnchor="end" fontFamily="Inter, system-ui, sans-serif">SHORT LIQUIDATIONS ▶</text>
      </svg>
    </div>
  );
}

export function LiquidationPanel({ s }: { s: DeskSnapshot }) {
  const [asset, setAsset] = useState<Asset>('BTC');
  const a = s.assets[asset];
  const acct = s.account;
  const mr = acct.marginRatio;
  const mrTone = mr > 0.85 ? 'bg-down' : mr > 0.6 ? 'bg-warn' : 'bg-up';
  const dist = (c: typeof a.nearestLong) => (c ? `${fmtNum(c.price, ASSETS[asset].decimals)} (${((c.price / a.spot - 1) * 100).toFixed(1)}%) · ${fmtCompactUsd(c.notional)}` : '—');
  const danger = s.risk.liqDown !== null && Math.abs(s.risk.liqDown) < 0.05;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Liquidation Pressure <span className="text-muted">·</span> <span className="text-dim">market leverage map + account liquidation risk</span>
        </span>
      }
      right={ASSET_LIST.map((x) => (
        <Chip key={x} active={x === asset} onClick={() => setAsset(x)}>{x}</Chip>
      ))}
      className={danger ? 'border-down/60' : ''}
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Heatmap s={s} asset={asset} />
          <div className="mt-1 grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <div className="flex justify-between text-muted"><span>Cascade risk ↓ (longs ≤3%)</span><span className="num text-down">{(a.cascadeRiskDown * 100).toFixed(0)}%</span></div>
              <Bar value={a.cascadeRiskDown} tone="bg-down" />
            </div>
            <div>
              <div className="flex justify-between text-muted"><span>Squeeze risk ↑ (shorts ≤3%)</span><span className="num text-up">{(a.cascadeRiskUp * 100).toFixed(0)}%</span></div>
              <Bar value={a.cascadeRiskUp} tone="bg-up" />
            </div>
          </div>
        </div>

        <div className="text-[11px]">
          <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-muted">Market · {asset}-PERP</div>
          <Row label="Longs liquidated 1h" value={fmtCompactUsd(a.liq1hLong)} tone={a.liq1hLong > 0 ? 'text-down' : 'text-muted'} />
          <Row label="Shorts liquidated 1h" value={fmtCompactUsd(a.liq1hShort)} tone={a.liq1hShort > 0 ? 'text-up' : 'text-muted'} />
          <Row label="Nearest long cluster" value={dist(a.nearestLong)} tone="text-down" />
          <Row label="Nearest short cluster" value={dist(a.nearestShort)} tone="text-up" />
          <Row label="Funding (8h)" value={`${(a.funding * 100).toFixed(4)}%`} tone={a.funding >= 0 ? 'text-up' : 'text-down'} />
          <Row label="Perp open interest" value={fmtCompactUsd(a.perpOi)} />
          <div className="scroll-thin mt-1 max-h-[54px] overflow-auto">
            {s.marketLiqs.slice(0, 6).map((e, i) => (
              <div key={i} className="num flex justify-between text-[9.5px] text-dim">
                <span>{fmtTime(e.time, false)} {e.asset} {e.side === 'LONG' ? 'LONGS' : 'SHORTS'}</span>
                <span className={e.side === 'LONG' ? 'text-down' : 'text-up'}>{fmtCompactUsd(e.notional)} {(e.impactPct * 100).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-[11px]">
          <div className="mb-1 flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-wider text-muted">
            <span>Account · Margin</span>
            {danger && <span className="pulse-dot rounded-sm bg-down px-1 text-white">LIQ DANGER</span>}
          </div>
          <div className="flex justify-between text-[10px] text-muted">
            <span>Margin ratio (MM / equity)</span>
            <span className={`num font-semibold ${mr > 0.85 ? 'text-down' : mr > 0.6 ? 'text-warn' : 'text-up'}`}>{(mr * 100).toFixed(1)}%</span>
          </div>
          <div className="relative">
            <Bar value={mr} tone={mrTone} className="h-2.5" />
            <div className="absolute inset-y-0 left-full -ml-px w-px bg-down" />
          </div>
          <div className="num mt-0.5 flex justify-between text-[9px] text-muted"><span>0%</span><span className="text-warn">60%</span><span className="text-down">100% = LIQ</span></div>
          <Row label="Equity / IM / MM" value={`${fmtUsd(acct.equity)} / ${fmtUsd(acct.im)} / ${fmtUsd(acct.mm)}`} />
          <Row label="Liq. trigger (BTC-led) ↓" value={s.risk.liqDown === null ? '> 40%' : `${(s.risk.liqDown * 100).toFixed(1)}%`} tone={s.risk.liqDown !== null ? 'text-down' : 'text-up'} />
          <Row label="Liq. trigger ↑" value={s.risk.liqUp === null ? '> 40%' : `+${(s.risk.liqUp * 100).toFixed(1)}%`} tone={s.risk.liqUp !== null ? 'text-down' : 'text-up'} />
          <Row label="Forced liquidations" value={`${acct.liqCount} (acct) · ${s.blowups} wipeouts`} tone={acct.liqCount ? 'text-down' : 'text-dim'} />
          <div className="scroll-thin mt-1 max-h-[40px] overflow-auto">
            {s.accountLiqs.slice(0, 4).map((e, i) => (
              <div key={i} className="num flex justify-between text-[9.5px] text-down">
                <span>{fmtTime(e.time, false)} {e.strategy}</span>
                <span>{fmtUsd(e.lossUsd)} fee {fmtUsd(e.feeUsd, 1)}</span>
              </div>
            ))}
            {!s.accountLiqs.length && <div className="text-[9.5px] text-muted">No forced liquidations yet</div>}
          </div>
        </div>
      </div>
    </Panel>
  );
}
