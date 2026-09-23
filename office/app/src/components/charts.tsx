import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Tooltip that follows the pointer inside a chart. */
function Tip({ tip }: { tip: { x: number; y: number; text: ReactNode } | null }) {
  if (!tip) return null;
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] text-ink shadow-pop"
      style={{ left: tip.x, top: tip.y - 8 }}>
      {tip.text}
    </div>
  );
}

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
};

/** Vertical bars for a single series over time (e.g. agent activity per day). */
export function BarChart({ data, height = 200, unit, label }: { data: { label: string; value: number; hint?: string }[]; height?: number; unit: string; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<{ x: number; y: number; text: ReactNode } | null>(null);
  const padL = 30, padB = 22, padT = 8;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const innerW = Math.max(0, w - padL - 4), innerH = height - padB - padT;
  const step = data.length ? innerW / data.length : 0;
  const bw = Math.max(2, Math.min(28, step - 4));
  const ticks = [0, max / 2, max];
  const every = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 44)));
  return (
    <div ref={ref} dir="ltr" className="relative w-full" onMouseLeave={() => setTip(null)}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={label} className="block overflow-visible">
          {ticks.map((t) => {
            const y = padT + innerH - (t / max) * innerH;
            return (
              <g key={t}>
                <line x1={padL} x2={w} y1={y} y2={y} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '3 4'} />
                <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">{t}</text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / max) * innerH;
            const x = padL + i * step + (step - bw) / 2;
            const y = padT + innerH - h;
            return (
              <g key={i}>
                <rect x={padL + i * step} y={padT} width={step} height={innerH} fill="transparent"
                  onMouseMove={() => setTip({ x: x + bw / 2, y: Math.min(y, padT + innerH - 4), text: <><b className="tnum">{d.value}</b> {unit} · {d.hint ?? d.label}</> })} />
                {d.value > 0 && <path d={`M${x},${padT + innerH} V${y + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${padT + innerH} Z`} fill="var(--series-1)" pointerEvents="none" />}
                {i % every === 0 && <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--muted)" className="tnum">{d.label}</text>}
              </g>
            );
          })}
        </svg>
      )}
      <Tip tip={tip} />
    </div>
  );
}

/** Horizontal bars with direct labels (e.g. cost per project). */
export function HBarChart({ data, format, label }: { data: { label: string; value: number; hint?: string }[]; format: (v: number) => string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="grid gap-2.5" aria-label={label}>
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-3 text-[13px]" title={d.hint ? `${d.label} · ${d.hint}` : d.label}>
          <span className="truncate text-ink-2">{d.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (d.value / max) * 100)}%`, background: 'var(--series-1)' }} />
          </span>
          <span className="tnum min-w-14 text-start font-medium text-ink">{format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** One stacked bar of parts of a whole, with a labelled legend (identity never by colour alone). */
export function PartsBar({ parts, label }: { parts: { key: string; label: string; value: number; color: string; icon: string }[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="grid gap-3">
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
        {parts.filter((p) => p.value > 0).map((p) => <span key={p.key} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
        {parts.map((p) => (
          <li key={p.key} className="inline-flex items-center gap-1.5 text-ink-2">
            <span style={{ color: p.color }}><Icon name={p.icon} size={14} strokeWidth={2.2} /></span>
            {p.label} <b className="tnum text-ink">{p.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Accessible table view that every chart card can switch to. */
export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-[13px]">
        <thead><tr>{columns.map((c) => <th key={c} className="border-b border-line py-2 text-start font-medium text-muted">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="tnum border-b border-line/60 py-1.5 text-ink">{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
