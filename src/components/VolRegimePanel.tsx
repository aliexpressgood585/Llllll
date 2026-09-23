import type { DeskSnapshot } from '../engine/engine';
import { ASSET_LIST } from '../engine/config';
import { Panel, Row } from './ui';

export function VolRegimePanel({ s }: { s: DeskSnapshot }) {
  const b = s.assets.BTC;
  const ratio = b.atmIv / Math.max(0.01, b.realizedVol);
  const level = b.atmIv > 0.9 ? 'קיצוני' : b.atmIv > 0.65 ? 'מוגבר' : b.atmIv > 0.42 ? 'רגיל' : 'דחוס';
  const pos = Math.min(1, Math.max(0, (b.atmIv - 0.25) / 0.9));
  const tone = level === 'קיצוני' ? 'text-down' : level === 'מוגבר' ? 'text-warn' : 'text-up';
  // DVOL-style index: 30d IV blended across assets
  const vix = (ASSET_LIST.reduce((acc, a) => acc + s.assets[a].longIv, 0) / 3) * 100;
  return (
    <Panel title="משטר תנודתיות">
      <div className="flex items-center justify-between text-[11px]">
        <span className={`font-semibold uppercase ${tone}`}>משטר {level}</span>
        <span className="num text-dim">IV/RV {ratio.toFixed(2)}</span>
      </div>
      <div className="relative my-2 h-2 rounded-sm" style={{ background: 'linear-gradient(90deg,#1fd69a,#a3e635,#f5a524,#ff4d5e)' }}>
        <div className="absolute -top-1 h-4 w-[3px] rounded bg-white shadow" style={{ left: `calc(${pos * 100}% - 1px)` }} />
      </div>
      <Row label="אחוזון IV (30 יום)" value={`${(b.ivPercentile * 100).toFixed(0)}%`} />
      <Row label="דירוג IV (30 יום)" value={`${(b.ivRank * 100).toFixed(0)}%`} />
      <Row label="BTC IV ATM / ממומשת" value={`${(b.atmIv * 100).toFixed(1)} / ${(b.realizedVol * 100).toFixed(1)}`} />
      <Row label="מבנה עיתי (קרוב−30 יום)" value={`${((b.atmIv - b.longIv) * 100).toFixed(1)}v`} tone={b.atmIv > b.longIv ? 'text-warn' : 'text-up'} />
      <Row label="NVIX (משוקלל 30 יום)" value={vix.toFixed(1)} tone="text-white" />
    </Panel>
  );
}
