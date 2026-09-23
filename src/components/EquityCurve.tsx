import type { DeskSnapshot } from '../engine/engine';
import { useElementSize } from '../hooks/useElementSize';
import { fmtCompactUsd, fmtDate, fmtTime } from '../lib/format';
import { Panel } from './ui';

export function EquityCurve({ s }: { s: DeskSnapshot }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const pts = s.equity;
  const W = Math.max(50, size.width);
  const H1 = 132;
  const H2 = 58;
  const padL = 44;
  const t0 = pts[0]?.t ?? 0;
  const t1 = Math.max(t0 + 1, pts[pts.length - 1]?.t ?? 1);
  const eqs = pts.map((p) => p.equity);
  let lo = Math.min(...eqs, s.account.start);
  let hi = Math.max(...eqs, s.account.start);
  const pad = (hi - lo) * 0.08 || 50;
  lo -= pad;
  hi += pad;
  const minDD = Math.min(-0.02, ...pts.map((p) => p.dd));
  const X = (t: number) => padL + ((t - t0) / (t1 - t0)) * (W - padL - 4);
  const Y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H1 - 12);
  const YD = (d: number) => H1 + 12 + (d / minDD) * (H2 - 8);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.equity).toFixed(1)}`).join('');
  const area = `${line}L${X(t1)},${H1}L${X(t0)},${H1}Z`;
  const ddLine = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${YD(p.dd).toFixed(1)}`).join('');
  const ddArea = `${ddLine}L${X(t1)},${H1 + 12}L${X(t0)},${H1 + 12}Z`;
  const up = s.account.equity >= s.account.start;
  const span = t1 - t0;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + span * f);
  return (
    <Panel
      title="עקומת הון וירידות בזמן אמת"
      right={<span className="num text-[10px] text-muted">חשבון #{s.attempt} · שיא {fmtCompactUsd(s.account.peak)}</span>}
    >
      <div ref={ref} className="w-full">
        <svg width={W} height={H1 + H2 + 22} className="block">
          <defs>
            <linearGradient id="eqg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={up ? '#2ee6b6' : '#ff4d5e'} stopOpacity="0.35" />
              <stop offset="1" stopColor={up ? '#2ee6b6' : '#ff4d5e'} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const v = lo + (hi - lo) * f;
            return (
              <g key={f}>
                <line x1={padL} x2={W} y1={Y(v)} y2={Y(v)} stroke="#131c26" />
                <text x={2} y={Y(v) + 3} fontSize="9" fill="#5f6f82" fontFamily="JetBrains Mono, ui-monospace, monospace">{fmtCompactUsd(v)}</text>
              </g>
            );
          })}
          <line x1={padL} x2={W} y1={Y(s.account.start)} y2={Y(s.account.start)} stroke="#5f6f82" strokeDasharray="3 3" />
          <path d={area} fill="url(#eqg)" />
          <path d={line} fill="none" stroke={up ? '#2ee6b6' : '#ff4d5e'} strokeWidth={1.5} />
          {s.liqMarks.map((m, i) => (
            <g key={i}>
              <line x1={X(m.t)} x2={X(m.t)} y1={0} y2={H1} stroke="#ff4d5e" strokeOpacity={0.35} />
              <circle cx={X(m.t)} cy={Y(m.equity)} r={3.5} fill="#ff4d5e" stroke="#fff" strokeWidth={0.8}>
                <title>חיסול כפוי</title>
              </circle>
            </g>
          ))}
          <text x={padL + 2} y={H1 + 10} fontSize="9" fill="#5f6f82" fontFamily="Inter, system-ui, sans-serif">ירידה מהשיא</text>
          {[0, 0.5, 1].map((f) => (
            <text key={f} x={2} y={YD(minDD * f) + 3} fontSize="9" fill="#5f6f82" fontFamily="JetBrains Mono, ui-monospace, monospace">{(minDD * f * 100).toFixed(0)}%</text>
          ))}
          <path d={ddArea} fill="rgba(255,77,94,0.25)" />
          <path d={ddLine} fill="none" stroke="#ff4d5e" strokeWidth={1.2} />
          {ticks.map((t, i) => (
            <text key={i} x={Math.min(W - 40, X(t))} y={H1 + H2 + 20} fontSize="9" fill="#5f6f82" fontFamily="JetBrains Mono, ui-monospace, monospace">{span > 36 * 3600e3 ? fmtDate(t) : fmtTime(t, false)}</text>
          ))}
        </svg>
      </div>
    </Panel>
  );
}
