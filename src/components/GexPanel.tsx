import { useState } from 'react';
import type { DeskSnapshot } from '../engine/engine';
import { ASSETS, ASSET_LIST } from '../engine/config';
import type { Asset } from '../engine/types';
import { fmtCompactUsd, fmtNum } from '../lib/format';
import { Chip, Panel, Row } from './ui';

export function GexPanel({ s }: { s: DeskSnapshot }) {
  const [asset, setAsset] = useState<Asset>('BTC');
  const g = s.gex[asset];
  const spot = s.assets[asset].spot;
  const dp = ASSETS[asset].decimals;
  const neg = g.totalAsset < 0;
  const prof = g.profile.filter((p) => Math.abs(p.strike / spot - 1) < 0.12);
  const maxAbs = Math.max(...prof.map((p) => Math.abs(p.gex)), 1);
  return (
    <Panel title="Dealer Gamma Exposure (GEX)" right={ASSET_LIST.map((a) => <Chip key={a} active={a === asset} onClick={() => setAsset(a)}>{a}</Chip>)}>
      <Row label={`Total GEX (${asset})`} value={`${fmtNum(g.totalAsset, 0)} ${asset}`} tone={neg ? 'text-down' : 'text-up'} />
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${neg ? 'text-down' : 'text-up'}`}>
        GEX regime {neg ? 'negative (short-gamma dealers → amplifying)' : 'positive (long-gamma dealers → dampening)'}
      </div>
      <Row label="$ GEX / 1% move" value={fmtCompactUsd(g.totalUsd, true)} tone={neg ? 'text-down' : 'text-up'} />
      <Row label="Pinning strikes (front)" value={g.pinning.map((p) => fmtNum(p, 0)).join(' | ')} />
      <Row label="Highest |GEX| strike" value={fmtNum(g.highestStrike, dp)} />
      <Row label="Gamma flip" value={g.flip ? fmtNum(g.flip, dp) : 'none ±8%'} tone="text-warn" />
      <div className="mt-2 flex h-[52px] items-center gap-[1px]">
        {prof.map((p) => {
          const h = (Math.abs(p.gex) / maxAbs) * 24;
          const atm = Math.abs(p.strike - spot) < ASSETS[asset].strikeStep / 2;
          return (
            <div key={p.strike} className="relative flex h-full flex-1 flex-col items-center justify-center" title={`${p.strike}: ${fmtCompactUsd(p.gex)}`}>
              <div className="flex h-1/2 w-full items-end">{p.gex > 0 && <div className="w-full bg-up/80" style={{ height: h }} />}</div>
              <div className="flex h-1/2 w-full items-start">{p.gex < 0 && <div className="w-full bg-down/80" style={{ height: h }} />}</div>
              {atm && <div className="absolute inset-y-0 w-[2px] bg-cyan" />}
            </div>
          );
        })}
      </div>
      <div className="num flex justify-between text-[9px] text-muted">
        <span>{fmtNum(prof[0]?.strike ?? 0, 0)}</span>
        <span className="text-cyan">spot {fmtNum(spot, dp)}</span>
        <span>{fmtNum(prof[prof.length - 1]?.strike ?? 0, 0)}</span>
      </div>
    </Panel>
  );
}
