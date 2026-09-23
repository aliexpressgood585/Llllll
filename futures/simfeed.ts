/** Synthetic 1-minute market for tests and the demo: regimes (trend up / down / flat), noise and rare spikes. */
import type { Book, Candle, Feed, Quote, SymbolInfo } from './feed';

export const MIN = 60e3, H = 3600e3;
export let T0 = Date.UTC(2026, 8, 1);
export const PRE = 7 * 24 * 60;
let N = 0;
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

export const SPEC: Record<string, { p: number; vol: number; step: number; tick: number; minNotional: number }> = {
  BTCUSDT: { p: 64000, vol: 0.0009, step: 0.001, tick: 0.1, minNotional: 100 },
  ETHUSDT: { p: 3200, vol: 0.0011, step: 0.001, tick: 0.01, minNotional: 20 },
  SOLUSDT: { p: 150, vol: 0.0015, step: 1, tick: 0.01, minNotional: 5 },
  BNBUSDT: { p: 580, vol: 0.001, step: 0.01, tick: 0.01, minNotional: 5 },
  XRPUSDT: { p: 0.55, vol: 0.0014, step: 0.1, tick: 0.0001, minNotional: 5 },
};
const minutes = new Map<string, number[]>();
/** Build the market: `days` of trading after a week of history, starting at `start`. */
export function buildMarket(days: number, start = T0, rngSeed = 42) {
  T0 = start; seed = rngSeed; N = PRE + days * 24 * 60; minutes.clear();
  for (const [s, sp] of Object.entries(SPEC)) {
    const a: number[] = []; let p = sp.p, drift = 0;
    for (let i = 0; i < N; i++) {
      if (i % (36 * 60) === 0) drift = (rand() - 0.5) * sp.vol * 0.06; // regime: trend up / down / flat
      const shock = rand() < 0.0004 ? (rand() - 0.5) * 0.06 : 0; // rare spikes
      p *= 1 + drift + sp.vol * gauss() + shock;
      a.push(p);
    }
    minutes.set(s, a);
  }
}
function agg(s: string, ms: number, fromIdx: number, toIdx: number): Candle {
  const a = minutes.get(s)!;
  const seg = a.slice(fromIdx, toIdx + 1);
  const t = T0 - PRE * MIN + fromIdx * MIN;
  return { t, o: seg[0], h: Math.max(...seg), l: Math.min(...seg), c: seg.at(-1)!, v: 1, closeT: t + ms - 1 };
}

export class SimFeed implements Feed {
  t = T0;
  now() { return this.t; }
  idx() { return Math.min(N - 1, Math.floor((this.t - (T0 - PRE * MIN)) / MIN)); }
  price(s: string) { return minutes.get(s)![this.idx()]; }
  async symbols(list: string[]): Promise<SymbolInfo[]> { return list.filter((s) => SPEC[s]).map((s) => ({ symbol: s, step: SPEC[s].step, tick: SPEC[s].tick, minQty: SPEC[s].step, minNotional: SPEC[s].minNotional })); }
  async quotes(list: string[]): Promise<Quote[]> {
    const next = Math.ceil((this.t + 1) / (8 * H)) * 8 * H;
    return list.map((s) => { const m = this.price(s); return { symbol: s, mark: m, index: m, bid: m * (1 - 0.00005), ask: m * (1 + 0.00005), funding: 0.0001 + 0.00005 * Math.sin(this.t / (5 * H) + s.length), nextFunding: next, t: this.t }; });
  }
  async candles(s: string, interval: string, limit: number): Promise<Candle[]> {
    const per = interval === '1h' ? 60 : 15;
    const cur = this.idx();
    const startOfCur = cur - (((cur % per) + per) % per);
    const out: Candle[] = [];
    for (let k = limit - 1; k >= 0; k--) {
      const from = startOfCur - k * per;
      if (from < 0) continue;
      out.push(agg(s, per * MIN, from, Math.min(cur, from + per - 1)));
    }
    return out;
  }
  async book(s: string): Promise<Book> {
    const m = this.price(s), unit = 30000 / m;
    return { bids: Array.from({ length: 20 }, (_, i) => [m * (1 - 0.00005 - i * 0.0001), unit * (1 + i)] as [number, number]), asks: Array.from({ length: 20 }, (_, i) => [m * (1 + 0.00005 + i * 0.0001), unit * (1 + i)] as [number, number]) };
  }
}

