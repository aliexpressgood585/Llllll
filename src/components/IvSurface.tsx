import { useEffect, useRef, useState } from 'react';
import type { DeskSnapshot } from '../engine/engine';
import { ASSET_LIST } from '../engine/config';
import type { Asset } from '../engine/types';
import { useElementSize } from '../hooks/useElementSize';
import { Chip, Panel } from './ui';

function color(t: number, a = 1): string {
  // teal -> cyan -> amber -> red
  const stops = [
    [8, 70, 90],
    [20, 170, 170],
    [46, 230, 182],
    [245, 200, 60],
    [255, 77, 94],
  ];
  const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function IvSurface({ s }: { s: DeskSnapshot }) {
  const [asset, setAsset] = useState<Asset>('BTC');
  const [wrapRef, size] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surf = s.surfaces[asset];

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || size.width < 10) return;
    const W = size.width;
    const H = 200;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const flat = surf.iv.flat();
    const lo = Math.min(...flat) * 0.95;
    const hi = Math.max(...flat) * 1.02;
    const nx = surf.moneyness.length;
    const ny = surf.days.length;
    const theta = -0.75 + 0.18 * Math.sin(s.now / 3.6e6);
    const phi = 0.55;
    const scale = Math.min(W * 0.36, 120);
    const zScale = 78;
    const cx = W * 0.52;
    const cy = H * 0.56;
    const proj = (x: number, y: number, z: number) => {
      const xr = x * Math.cos(theta) - y * Math.sin(theta);
      const yr = x * Math.sin(theta) + y * Math.cos(theta);
      return { sx: cx + xr * scale, sy: cy + yr * scale * Math.sin(phi) - z * zScale * Math.cos(phi), depth: yr };
    };
    const X = (i: number) => (i / (nx - 1)) * 2 - 1;
    const Y = (j: number) => (j / (ny - 1)) * 2 - 1;
    const Z = (v: number) => (v - lo) / (hi - lo);

    // floor grid
    ctx.strokeStyle = 'rgba(95,111,130,0.25)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i <= 4; i++) {
      const t = (i / 4) * 2 - 1;
      let a = proj(t, -1, 0);
      let b = proj(t, 1, 0);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      a = proj(-1, t, 0);
      b = proj(1, t, 0);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    // vertical axis
    const o = proj(-1, -1, 0);
    const top = proj(-1, -1, 1);
    ctx.beginPath(); ctx.moveTo(o.sx, o.sy); ctx.lineTo(top.sx, top.sy); ctx.stroke();

    const quads: { d: number; pts: { sx: number; sy: number }[]; z: number }[] = [];
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const v = [surf.iv[j][i], surf.iv[j][i + 1], surf.iv[j + 1][i + 1], surf.iv[j + 1][i]];
        const p = [proj(X(i), Y(j), Z(v[0])), proj(X(i + 1), Y(j), Z(v[1])), proj(X(i + 1), Y(j + 1), Z(v[2])), proj(X(i), Y(j + 1), Z(v[3]))];
        quads.push({ d: p.reduce((acc, q) => acc + q.depth, 0) / 4, pts: p, z: Z((v[0] + v[1] + v[2] + v[3]) / 4) });
      }
    quads.sort((a, b) => a.d - b.d);
    for (const q of quads) {
      ctx.beginPath();
      ctx.moveTo(q.pts[0].sx, q.pts[0].sy);
      for (let k = 1; k < 4; k++) ctx.lineTo(q.pts[k].sx, q.pts[k].sy);
      ctx.closePath();
      ctx.fillStyle = color(q.z, 0.78);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,255,230,0.35)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // labels
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = '#7d8da0';
    for (let k = 0; k <= 3; k++) {
      const v = lo + ((hi - lo) * k) / 3;
      const p = proj(-1, -1, k / 3);
      ctx.fillText(`${(v * 100).toFixed(0)}`, Math.max(2, p.sx - 20), p.sy + 3);
    }
    for (const [i, lbl] of [[0, '-30%'], [6, 'ATM'], [12, '+30%']] as const) {
      const p = proj(X(i), 1, 0);
      ctx.fillText(lbl, p.sx - 10, p.sy + 12);
    }
    for (const j of [0, 4, 7, 10]) {
      const p = proj(1, Y(j), 0);
      ctx.fillText(`${surf.days[j]}d`, p.sx + 6, p.sy + 4);
    }
    ctx.fillStyle = '#5f6f82';
    ctx.fillText('IV %', 6, 12);
    ctx.fillText('Days to Expiry →', W - 100, H - 6);
  }, [surf, size.width, s.now]);

  const atm = s.assets[asset];
  return (
    <Panel
      title="Real-Time IV Surface 3D"
      right={ASSET_LIST.map((a) => (
        <Chip key={a} active={a === asset} onClick={() => setAsset(a)}>{a}</Chip>
      ))}
    >
      <div ref={wrapRef} className="relative w-full">
        <canvas ref={canvasRef} className="block" />
        <div className="num absolute right-0 top-0 text-right text-[10px] leading-tight text-dim">
          <div>ATM <span className="text-white">{(atm.atmIv * 100).toFixed(1)}</span></div>
          <div>30D <span className="text-white">{(atm.longIv * 100).toFixed(1)}</span></div>
          <div>SKEW <span className={atm.skew < 0 ? 'text-down' : 'text-up'}>{atm.skew.toFixed(2)}</span></div>
        </div>
      </div>
    </Panel>
  );
}
