import { useMemo, useState } from 'react';
import type { DeskSnapshot } from '../engine/engine';
import { ASSETS, ASSET_LIST } from '../engine/config';
import type { Asset } from '../engine/types';
import { fmtExpiryLong, fmtNum, fmtSignedUsd } from '../lib/format';
import { Chip, Panel } from './ui';

type TypeFilter = 'ALL' | 'C' | 'P';

export function OptionsChain({ s }: { s: DeskSnapshot }) {
  const [asset, setAsset] = useState<Asset>('BTC');
  const [tf, setTf] = useState<TypeFilter>('ALL');
  const [posOnly, setPosOnly] = useState(false);
  const [expiry, setExpiry] = useState<number | 'ALL'>('ALL');
  const [width, setWidth] = useState(3);
  const cfg = ASSETS[asset];
  const spot = s.assets[asset].spot;

  const rows = useMemo(() => {
    const all = s.chains[asset];
    // strike window = N listed strikes either side of spot, per expiry (works for sim grids and Deribit listings)
    const near = new Map<number, Set<number>>();
    for (const r of all) {
      if (!near.has(r.expiry)) {
        const ks = [...new Set(all.filter((x) => x.expiry === r.expiry).map((x) => x.strike))].sort((a, b) => a - b);
        let atm = 0;
        ks.forEach((k, i) => {
          if (Math.abs(k - spot) < Math.abs(ks[atm] - spot)) atm = i;
        });
        near.set(r.expiry, new Set(ks.slice(Math.max(0, atm - width), atm + width + 1)));
      }
    }
    return all.filter((r) => {
      if (tf !== 'ALL' && r.type !== tf) return false;
      if (expiry !== 'ALL' && r.expiry !== expiry) return false;
      if (posOnly) return r.position !== 0;
      return near.get(r.expiry)!.has(r.strike) || r.position !== 0;
    });
  }, [s.chains, asset, tf, expiry, posOnly, width, spot]);

  const dp = asset === 'BTC' ? 2 : asset === 'ETH' ? 1 : 0;
  const px = (v: number) => (v <= 0 ? '—' : fmtNum(v, asset === 'BTC' ? 0 : asset === 'ETH' ? 1 : 2));
  const posCount = s.chains[asset].filter((r) => r.position !== 0).length;

  return (
    <Panel
      title={
        <span>
          {s.source.mode === 'live' ? 'שרשרת אופציות Deribit' : 'שרשרת אופציות (סימולציה)'} · <span className="text-accent">{asset}</span> <span className="num text-dim">{fmtNum(spot, cfg.decimals)}</span> · {expiry === 'ALL' ? 'כל הפקיעות' : fmtExpiryLong(expiry)}
        </span>
      }
      right={
        <>
          {ASSET_LIST.map((a) => (
            <Chip key={a} active={a === asset} onClick={() => setAsset(a)}>{a}</Chip>
          ))}
          <span className="mx-1 h-3 w-px bg-line2" />
          {(['ALL', 'C', 'P'] as const).map((t) => (
            <Chip key={t} active={tf === t} onClick={() => setTf(t)}>{t === 'ALL' ? 'הכל' : t === 'C' ? 'קול' : 'פוט'}</Chip>
          ))}
          <Chip active={posOnly} onClick={() => setPosOnly((v) => !v)}>★ פוזיציות {posCount}</Chip>
        </>
      }
      bodyClass="p-0"
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-2.5 py-1">
        <Chip active={expiry === 'ALL'} onClick={() => setExpiry('ALL')}>הכל</Chip>
        {s.expiries.map((e) => (
          <Chip key={e} active={expiry === e} onClick={() => setExpiry(e)}>
            {fmtExpiryLong(e).replace(/ /g, '')}
          </Chip>
        ))}
        <span className="ms-auto flex items-center gap-1 text-[10px] text-muted">
          סטרייקים ±
          {[2, 3, 5, 9].map((w) => (
            <Chip key={w} active={width === w} onClick={() => setWidth(w)}>{w}</Chip>
          ))}
        </span>
      </div>
      <div className="scroll-thin h-[300px] overflow-auto">
        <table className="num w-full min-w-[860px] text-[10.5px]">
          <thead className="sticky top-0 z-10 bg-panel2 text-[9.5px] uppercase tracking-wider text-muted">
            <tr className="[&>th]:px-1.5 [&>th]:py-1 [&>th]:font-semibold">
              <th className="text-start">פקיעה</th>
              <th className="text-end">סטרייק</th>
              <th>סוג</th>
              <th className="text-end">ביד</th>
              <th className="text-end">אסק</th>
              <th className="text-end">מארק</th>
              <th className="text-end">IV</th>
              <th className="text-end">דלתא</th>
              <th className="text-end">גמא</th>
              <th className="text-end">וגה</th>
              <th className="text-end">תטא</th>
              <th className="text-end">OI</th>
              <th className="text-end">מחזור</th>
              <th className="text-end">פוזיציה</th>
              <th className="text-end">לא ממומש</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const itm = r.type === 'C' ? r.strike < spot : r.strike > spot;
              const held = r.position !== 0;
              return (
                <tr key={r.symbol} className={`border-t border-line/60 [&>td]:px-1.5 [&>td]:py-[3px] hover:bg-white/[0.03] ${held ? 'bg-accent/[0.07]' : itm ? 'bg-white/[0.015]' : ''}`}>
                  <td className="text-start text-dim">
                    {fmtExpiryLong(r.expiry)} <span className="text-muted">({r.dte})</span>
                  </td>
                  <td className="text-end font-semibold text-white">{fmtNum(r.strike, cfg.decimals > 1 ? 0 : 0)}</td>
                  <td className={`text-center font-semibold ${r.type === 'C' ? 'text-up' : 'text-down'}`}>{r.type}</td>
                  <td className="text-end text-up">
                    {px(r.bid)} <span className="text-[9px] text-muted">{fmtNum(r.bidSize, dp)}</span>
                  </td>
                  <td className="text-end text-down">
                    {px(r.ask)} <span className="text-[9px] text-muted">{fmtNum(r.askSize, dp)}</span>
                  </td>
                  <td className="text-end text-text">{px(r.mark)}</td>
                  <td className="text-end text-warn">{(r.iv * 100).toFixed(1)}</td>
                  <td className={`text-end ${r.delta >= 0 ? 'text-up' : 'text-down'}`}>{r.delta.toFixed(2)}</td>
                  <td className="text-end text-dim">{r.gamma.toExponential(1)}</td>
                  <td className="text-end text-dim">{r.vega.toFixed(asset === 'SOL' ? 3 : 1)}</td>
                  <td className="text-end text-down">{r.theta.toFixed(asset === 'SOL' ? 3 : 1)}</td>
                  <td className="text-end text-dim">{fmtNum(r.oi, 0)}</td>
                  <td className="text-end text-dim">{fmtNum(r.volume, 0)}</td>
                  <td className={`text-end font-semibold ${r.position > 0 ? 'text-up' : r.position < 0 ? 'text-down' : 'text-muted'}`}>{held ? fmtNum(r.position, dp) : '·'}</td>
                  <td className={`text-end ${r.upnl >= 0 ? 'text-up' : 'text-down'}`}>{held ? fmtSignedUsd(r.upnl, 0) : ''}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={15} className="py-8 text-center text-muted">אין חוזים התואמים לסינון</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
