import type { DeskSnapshot } from '../engine/engine';
import { ASSET_LIST } from '../engine/config';
import { Panel, Row } from './ui';

export function VolRegimePanel({ s }: { s: DeskSnapshot }) {
  const b = s.assets.BTC;
  const ratio = b.atmIv / Math.max(0.01, b.realizedVol);
  const level = b.atmIv > 0.9 ? 'EXTREME' : b.atmIv > 0.65 ? 'ELEVATED' : b.atmIv > 0.42 ? 'NORMAL' : 'COMPRESSED';
  const pos = Math.min(1, Math.max(0, (b.atmIv - 0.25) / 0.9));
  const tone = level === 'EXTREME' ? 'text-down' : level === 'ELEVATED' ? 'text-warn' : 'text-up';
  // DVOL-style index: 30d IV blended across assets
  const vix = (ASSET_LIST.reduce((acc, a) => acc + s.assets[a].longIv, 0) / 3) * 100;
  return (
    <Panel title="Volatility Regime">
      <div className="flex items-center justify-between text-[11px]">
        <span className={`font-semibold uppercase ${tone}`}>Regime {level}</span>
        <span className="num text-dim">IV/RV {ratio.toFixed(2)}</span>
      </div>
      <div className="relative my-2 h-2 rounded-sm" style={{ background: 'linear-gradient(90deg,#1fd69a,#a3e635,#f5a524,#ff4d5e)' }}>
        <div className="absolute -top-1 h-4 w-[3px] rounded bg-white shadow" style={{ left: `calc(${pos * 100}% - 1px)` }} />
      </div>
      <Row label="IV percentile (30D)" value={`${(b.ivPercentile * 100).toFixed(0)}%`} />
      <Row label="IV rank (30D)" value={`${(b.ivRank * 100).toFixed(0)}%`} />
      <Row label="BTC ATM IV / RV" value={`${(b.atmIv * 100).toFixed(1)} / ${(b.realizedVol * 100).toFixed(1)}`} />
      <Row label="Term spread (front−30D)" value={`${((b.atmIv - b.longIv) * 100).toFixed(1)}v`} tone={b.atmIv > b.longIv ? 'text-warn' : 'text-up'} />
      <Row label="NVIX (blended 30D)" value={vix.toFixed(1)} tone="text-white" />
    </Panel>
  );
}
