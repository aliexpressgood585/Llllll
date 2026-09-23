import type { Candle } from './feed';

export function ema(values: number[], n: number): number[] {
  const k = 2 / (n + 1), out: number[] = [];
  let prev = values[0];
  for (const v of values) { prev = out.length ? v * k + prev * (1 - k) : v; out.push(prev); }
  return out;
}
export function atr(c: Candle[], n = 14): number {
  if (c.length < n + 1) return NaN;
  const tr = c.slice(1).map((x, i) => Math.max(x.h - x.l, Math.abs(x.h - c[i].c), Math.abs(x.l - c[i].c)));
  let a = tr.slice(0, n).reduce((s, v) => s + v, 0) / n;
  for (const v of tr.slice(n)) a = (a * (n - 1) + v) / n; // Wilder
  return a;
}
export function rsi(values: number[], n = 14): number {
  if (values.length < n + 1) return NaN;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = values[i] - values[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < values.length; i++) { const d = values[i] - values[i - 1]; g = (g * (n - 1) + Math.max(0, d)) / n; l = (l * (n - 1) + Math.max(0, -d)) / n; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
export const floorStep = (v: number, step: number) => { const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9)); return Number((Math.floor(v / step + 1e-9) * step).toFixed(d)); };
