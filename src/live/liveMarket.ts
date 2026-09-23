import { bsGreeks } from '../lib/blackScholes';
import { ASSETS, ASSET_LIST, STEP_YEARS, STEPS_PER_HOUR } from '../engine/config';
import type { DataSourceStatus } from '../engine/engine';
import { instrumentSymbol, surfaceIv, type SurfaceState } from '../engine/market';
import type { InstrumentSpec, MarketSource } from '../engine/marketSource';
import { MS, YEAR_MS, yearsTo } from '../engine/time';
import type { Asset, AssetMarket, LiquidationCluster, MarketLiqEvent, OptionKey, OptionType, Quote, Regime } from '../engine/types';
import type { LiveLiquidation } from './binanceLiquidations';
import type { RpcClient } from './deribitClient';

/** Deribit venue mapping. BTC/ETH options are inverse (priced in coin); SOL options are USDC-linear. */
export const DERIBIT: Record<Asset, { currency: string; prefix: string; index: string; perp: string; inverse: boolean; dvol: string | null }> = {
  BTC: { currency: 'BTC', prefix: 'BTC-', index: 'btc_usd', perp: 'BTC-PERPETUAL', inverse: true, dvol: 'BTC' },
  ETH: { currency: 'ETH', prefix: 'ETH-', index: 'eth_usd', perp: 'ETH-PERPETUAL', inverse: true, dvol: 'ETH' },
  SOL: { currency: 'USDC', prefix: 'SOL_USDC-', index: 'sol_usdc', perp: 'SOL_USDC-PERPETUAL', inverse: false, dvol: null },
};

export interface DeribitInstrument {
  instrument_name: string;
  expiration_timestamp: number;
  strike: number;
  option_type: 'call' | 'put';
  min_trade_amount: number;
  tick_size: number;
  contract_size?: number;
  base_currency?: string;
  is_active?: boolean;
}

export interface DeribitBookSummary {
  instrument_name: string;
  bid_price: number | null;
  ask_price: number | null;
  mark_price: number;
  mark_iv: number; // percent
  underlying_price: number;
  open_interest: number;
  volume: number;
  estimated_delivery_price?: number;
}

interface Book {
  expiry: number;
  strike: number;
  type: OptionType;
  bid: number; // USD
  ask: number; // USD
  mark: number; // USD
  iv: number; // decimal
  fwd: number;
  oi: number;
  volume: number;
}

interface Smile {
  expiry: number;
  fwd: number;
  ks: number[]; // log-moneyness, sorted
  ivs: number[];
}

/** Share of market-wide perp OI assumed to be leveraged, and Deribit → whole-market OI multiplier (estimates). */
const LEVERAGED_SHARE = 0.25;
const MARKET_OI_MULT = 8;
const LEVERAGES: [number, number][] = [
  [10, 0.35],
  [25, 0.3],
  [50, 0.2],
  [100, 0.15],
];

const key = (a: Asset, e: number, k: number, t: OptionType) => `${a}|${e}|${k}|${t}`;

export function parseDeribitName(name: string): { expiryCode: string; strike: number; type: OptionType } | null {
  const parts = name.split('-');
  if (parts.length !== 4) return null;
  const strike = Number(parts[2].replace('d', '.'));
  const type = parts[3] === 'C' ? 'C' : parts[3] === 'P' ? 'P' : null;
  if (!type || !Number.isFinite(strike)) return null;
  return { expiryCode: parts[1], strike, type };
}

/**
 * Live market backed by Deribit public market data (options chain, index, perp funding/OI, price + DVOL history)
 * and Binance's public liquidation stream. Pure data: all fills against it are paper trades.
 */
export class LiveMarket implements MarketSource {
  readonly kind = 'live' as const;
  readonly regimeObservable = false;
  regime: Regime = 'NEUTRAL';
  assets: Record<Asset, AssetMarket>;
  liqEvents: MarketLiqEvent[] = [];

  private books = new Map<string, Book>();
  private instruments = new Map<string, DeribitInstrument>();
  private listed: Record<Asset, Map<number, number[]>> = { BTC: new Map(), ETH: new Map(), SOL: new Map() };
  private smiles: Record<Asset, Smile[]> = { BTC: [], ETH: [], SOL: [] };
  private specs: Record<Asset, InstrumentSpec> = {
    BTC: { minQty: 0.1, tick: 5, venues: ['DERIBIT'] },
    ETH: { minQty: 1, tick: 0.5, venues: ['DERIBIT'] },
    SOL: { minQty: 1, tick: 0.01, venues: ['DERIBIT'] },
  };
  private pendingLiqs: LiveLiquidation[] = [];
  private lastBooks = 0;
  private lastError = '';
  private state: DataSourceStatus['state'] = 'connecting';
  private timers: ReturnType<typeof setInterval>[] = [];
  liqStreamConnected = () => false;

  constructor(private rpc: RpcClient) {
    this.assets = {} as Record<Asset, AssetMarket>;
    for (const a of ASSET_LIST) {
      const c = ASSETS[a];
      this.assets[a] = {
        asset: a,
        spot: c.spot,
        prevDayClose: c.spot,
        atmIv: c.baseVol,
        longIv: c.baseVol,
        skew: 0,
        smile: 1,
        realizedVol: c.baseVol,
        funding: 0,
        perpOi: 0,
        history: [],
        ivHistory: [],
        clusters: [],
        liq1hLong: 0,
        liq1hShort: 0,
        liqWindow: [],
        lastReturn: 0,
      };
    }
  }

  // ---------------------------------------------------------------- loading
  /** Initial load: instruments, books, index, perps, 24h price history and 30d IV history. Throws if Deribit is unreachable. */
  async init(): Promise<void> {
    await this.loadInstruments();
    await Promise.all([this.refreshIndex(), this.refreshPerps()]);
    await this.refreshBooks();
    await Promise.all(ASSET_LIST.map((a) => this.backfill(a)));
    for (const a of ASSET_LIST) this.rebuildClusters(a);
    this.state = 'live';
    this.timers.push(setInterval(() => this.safe(() => Promise.all([this.refreshIndex(), this.refreshBooks()])), 5000));
    this.timers.push(setInterval(() => this.safe(() => this.refreshPerps()), 30000));
    this.timers.push(setInterval(() => this.safe(() => this.loadInstruments()), 30 * 60e3));
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.rpc.close();
  }

  private async safe(fn: () => Promise<unknown>) {
    try {
      await fn();
      this.lastError = '';
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
    }
  }

  async loadInstruments(): Promise<void> {
    const seen = new Set<string>();
    for (const cur of ['BTC', 'ETH', 'USDC']) {
      const list = await this.rpc.call<DeribitInstrument[]>('public/get_instruments', { currency: cur, kind: 'option', expired: false });
      for (const ins of list) {
        seen.add(ins.instrument_name);
        this.instruments.set(ins.instrument_name, ins);
      }
    }
    for (const n of [...this.instruments.keys()]) if (!seen.has(n)) this.instruments.delete(n);
    for (const a of ASSET_LIST) {
      const m = new Map<number, number[]>();
      let minQty = Infinity;
      let tick = Infinity;
      for (const ins of this.instruments.values()) {
        if (!ins.instrument_name.startsWith(DERIBIT[a].prefix)) continue;
        const ks = m.get(ins.expiration_timestamp) ?? [];
        if (!ks.includes(ins.strike)) ks.push(ins.strike);
        m.set(ins.expiration_timestamp, ks);
        minQty = Math.min(minQty, ins.min_trade_amount);
        tick = Math.min(tick, ins.tick_size);
      }
      for (const ks of m.values()) ks.sort((x, y) => x - y);
      this.listed[a] = m;
      if (Number.isFinite(minQty)) this.specs[a] = { ...this.specs[a], minQty };
      if (Number.isFinite(tick)) this.specs[a] = { ...this.specs[a], tick: DERIBIT[a].inverse ? tick * this.assets[a].spot : tick };
    }
  }

  async refreshIndex(): Promise<void> {
    await Promise.all(
      ASSET_LIST.map(async (a) => {
        const r = await this.rpc.call<{ index_price: number }>('public/get_index_price', { index_name: DERIBIT[a].index });
        if (r.index_price > 0) this.assets[a].spot = r.index_price;
      }),
    );
  }

  async refreshPerps(): Promise<void> {
    await Promise.all(
      ASSET_LIST.map(async (a) => {
        const t = await this.rpc.call<{ funding_8h?: number; open_interest?: number; index_price?: number }>('public/ticker', { instrument_name: DERIBIT[a].perp });
        const m = this.assets[a];
        if (typeof t.funding_8h === 'number') m.funding = t.funding_8h;
        if (typeof t.open_interest === 'number') m.perpOi = (DERIBIT[a].inverse ? t.open_interest : t.open_interest * m.spot) * MARKET_OI_MULT;
      }),
    );
  }

  async refreshBooks(): Promise<void> {
    const now = Date.now();
    const byCur = new Map<string, DeribitBookSummary[]>();
    for (const cur of ['BTC', 'ETH', 'USDC']) byCur.set(cur, await this.rpc.call<DeribitBookSummary[]>('public/get_book_summary_by_currency', { currency: cur, kind: 'option' }));
    this.ingestBooks(byCur, now);
    this.lastBooks = now;
  }

  /** Normalise Deribit summaries into USD books and per-expiry smiles (exposed for fixture tests). */
  ingestBooks(byCur: Map<string, DeribitBookSummary[]>, now: number): void {
    const books = new Map<string, Book>();
    for (const a of ASSET_LIST) {
      const cfg = DERIBIT[a];
      const index = this.assets[a].spot;
      const conv = (p: number | null | undefined) => (p && p > 0 ? (cfg.inverse ? p * index : p) : 0);
      const smiles = new Map<number, { fwd: number; pts: [number, number][] }>();
      for (const s of byCur.get(cfg.currency) ?? []) {
        if (!s.instrument_name.startsWith(cfg.prefix)) continue;
        const p = parseDeribitName(s.instrument_name);
        if (!p) continue;
        const expiry = this.instruments.get(s.instrument_name)?.expiration_timestamp ?? expiryFromCode(p.expiryCode);
        if (!expiry || expiry <= now) continue;
        const iv = s.mark_iv / 100;
        const fwd = s.underlying_price > 0 ? s.underlying_price : index;
        books.set(key(a, expiry, p.strike, p.type), { expiry, strike: p.strike, type: p.type, bid: conv(s.bid_price), ask: conv(s.ask_price), mark: conv(s.mark_price), iv, fwd, oi: s.open_interest ?? 0, volume: s.volume ?? 0 });
        if (!(iv > 0)) continue;
        // OTM side carries the cleaner IV at each strike
        const otm = (p.type === 'C' && p.strike >= fwd) || (p.type === 'P' && p.strike < fwd);
        if (!otm) continue;
        const sm = smiles.get(expiry) ?? { fwd, pts: [] };
        sm.pts.push([Math.log(p.strike / fwd), iv]);
        smiles.set(expiry, sm);
      }
      this.smiles[a] = [...smiles.entries()]
        .filter(([, v]) => v.pts.length >= 3)
        .map(([expiry, v]) => {
          v.pts.sort((x, y) => x[0] - y[0]);
          return { expiry, fwd: v.fwd, ks: v.pts.map((x) => x[0]), ivs: v.pts.map((x) => x[1]) };
        })
        .sort((x, y) => x.expiry - y.expiry);
      this.updateSurfaceSummary(a, now);
    }
    if (books.size) this.books = books;
  }

  private updateSurfaceSummary(a: Asset, now: number) {
    const m = this.assets[a];
    const look = this.lookupFn(a);
    const front = this.smiles[a].find((s) => s.expiry - now > MS.DAY) ?? this.smiles[a][0];
    if (!front) return;
    const Tf = yearsTo(front.expiry, now);
    m.atmIv = look(front.fwd, Tf) ?? m.atmIv;
    m.longIv = look(m.spot, 30 / 365) ?? m.longIv;
    const up = look(m.spot * 1.1, 30 / 365);
    const dn = look(m.spot * 0.9, 30 / 365);
    if (up !== null && dn !== null) m.skew = Math.max(-2, Math.min(0.8, ((up - dn) / Math.max(0.05, m.longIv)) * 5));
  }

  async backfill(a: Asset): Promise<void> {
    const end = Date.now();
    const m = this.assets[a];
    try {
      const r = await this.rpc.call<{ close: number[]; status: string }>('public/get_tradingview_chart_data', { instrument_name: DERIBIT[a].perp, start_timestamp: end - MS.DAY, end_timestamp: end, resolution: '1' });
      const closes = (r.close ?? []).filter((x) => x > 0);
      const step = Math.max(1, Math.round(60 / STEPS_PER_HOUR));
      m.history = closes.filter((_, i) => (closes.length - 1 - i) % step === 0);
      if (!m.history.length) m.history = [m.spot];
      m.prevDayClose = m.history[0];
      let v = 0;
      for (let i = 1; i < m.history.length; i++) {
        const r1 = Math.log(m.history[i] / m.history[i - 1]);
        v = i === 1 ? (r1 * r1) / STEP_YEARS : 0.985 * v + 0.015 * ((r1 * r1) / STEP_YEARS);
      }
      if (v > 0) m.realizedVol = Math.sqrt(v);
    } catch {
      m.history = [m.spot];
    }
    const dv = DERIBIT[a].dvol;
    if (dv) {
      try {
        const r = await this.rpc.call<{ data: [number, number, number, number, number][] }>('public/get_volatility_index_data', { currency: dv, start_timestamp: end - 30 * MS.DAY, end_timestamp: end, resolution: '3600' });
        m.ivHistory = (r.data ?? []).map((d) => d[4] / 100).filter((x) => x > 0);
      } catch {
        /* IV rank builds up from live samples instead */
      }
    }
    if (!m.ivHistory.length) m.ivHistory = [m.longIv];
  }

  onLiquidation = (l: LiveLiquidation): void => {
    this.pendingLiqs.push(l);
  };

  // ---------------------------------------------------------------- MarketSource
  step(now: number): { events: MarketLiqEvent[]; regimeChanged: boolean } {
    const events: MarketLiqEvent[] = [];
    for (const l of this.pendingLiqs.splice(0)) {
      const ev: MarketLiqEvent = { time: l.time, asset: l.asset, side: l.side, notional: l.notional, price: l.price, impactPct: 0 };
      events.push(ev);
      this.assets[l.asset].liqWindow.push({ time: l.time, side: l.side, notional: l.notional });
    }
    this.liqEvents.push(...events);
    if (this.liqEvents.length > 200) this.liqEvents.splice(0, this.liqEvents.length - 200);

    let extreme = 0;
    for (const a of ASSET_LIST) {
      const m = this.assets[a];
      const prev = m.history[m.history.length - 1] ?? m.spot;
      m.lastReturn = Math.log(m.spot / prev);
      m.history.push(m.spot);
      if (m.history.length > 2400) m.history.splice(0, m.history.length - 2400);
      m.realizedVol = Math.sqrt(0.985 * m.realizedVol ** 2 + 0.015 * ((m.lastReturn * m.lastReturn) / STEP_YEARS));
      m.liqWindow = m.liqWindow.filter((w) => now - w.time <= MS.HOUR);
      m.liq1hLong = m.liqWindow.filter((w) => w.side === 'LONG').reduce((s, w) => s + w.notional, 0);
      m.liq1hShort = m.liqWindow.filter((w) => w.side === 'SHORT').reduce((s, w) => s + w.notional, 0);
      this.rebuildClusters(a);
      const c = ASSETS[a];
      if (m.realizedVol > c.baseVol * 1.6 || (m.liq1hLong + m.liq1hShort) / c.liqDepthPer1Pct > 1) extreme++;
    }
    // coarse observable state used only for execution stress & VaR scaling
    this.regime = extreme >= 2 ? 'EXTREME' : 'NEUTRAL';
    return { events, regimeChanged: false };
  }

  onHour(): void {
    for (const a of ASSET_LIST) {
      const m = this.assets[a];
      m.ivHistory.push(m.longIv);
      if (m.ivHistory.length > 24 * 30) m.ivHistory.shift();
    }
  }

  onDay(): void {
    for (const a of ASSET_LIST) this.assets[a].prevDayClose = this.assets[a].spot;
  }

  private lookupFn(a: Asset): (strike: number, T: number) => number | null {
    const smiles = this.smiles[a];
    const spot = this.assets[a].spot;
    return (strike: number, T: number) => {
      if (!smiles.length) return null;
      const now = Date.now();
      const Ts = smiles.map((s) => Math.max(1 / (365 * 24 * 12), (s.expiry - now) / YEAR_MS));
      const ivAt = (i: number) => {
        const s = smiles[i];
        const x = Math.log(strike / (s.fwd || spot));
        const { ks, ivs } = s;
        if (x <= ks[0]) return ivs[0];
        if (x >= ks[ks.length - 1]) return ivs[ivs.length - 1];
        let j = 1;
        while (ks[j] < x) j++;
        const f = (x - ks[j - 1]) / (ks[j] - ks[j - 1]);
        return ivs[j - 1] + f * (ivs[j] - ivs[j - 1]);
      };
      if (T <= Ts[0]) return ivAt(0);
      if (T >= Ts[Ts.length - 1]) return ivAt(Ts.length - 1);
      let i = 1;
      while (Ts[i] < T) i++;
      // interpolate in total variance between neighbouring expiries
      const v0 = ivAt(i - 1) ** 2 * Ts[i - 1];
      const v1 = ivAt(i) ** 2 * Ts[i];
      const f = (T - Ts[i - 1]) / (Ts[i] - Ts[i - 1]);
      return Math.sqrt(Math.max(1e-6, (v0 + f * (v1 - v0)) / T));
    };
  }

  surface(a: Asset): SurfaceState {
    const m = this.assets[a];
    return { spot: m.spot, atmIv: m.atmIv, longIv: m.longIv, skew: m.skew, smile: 1, lookup: this.lookupFn(a), atm0: m.atmIv };
  }

  expiries(now: number): number[] {
    const all = new Set<number>();
    for (const a of ASSET_LIST) for (const e of this.listed[a].keys()) if (e > now + 5 * 60e3) all.add(e);
    const sorted = [...all].sort((x, y) => x - y);
    // front 7 + the listed expiry closest to 60 days, for term-structure trades
    const front = sorted.slice(0, 7);
    const far = sorted.filter((e) => e > (front[front.length - 1] ?? 0));
    const target = now + 60 * MS.DAY;
    if (far.length) front.push(far.reduce((b, e) => (Math.abs(e - target) < Math.abs(b - target) ? e : b), far[0]));
    return front;
  }

  strikes(a: Asset, expiry: number, now: number): number[] {
    void now;
    const spot = this.assets[a].spot;
    const ks = this.listed[a].get(expiry);
    if (!ks) return [];
    return ks.filter((k) => Math.abs(k / spot - 1) <= 0.3);
  }

  spec(a: Asset): InstrumentSpec {
    return this.specs[a];
  }

  quote(k: OptionKey, now: number): Quote {
    const b = this.books.get(key(k.asset, k.expiry, k.strike, k.type));
    const T = yearsTo(k.expiry, now);
    const spec = this.specs[k.asset];
    const surf = this.surface(k.asset);
    const iv = b && b.iv > 0 ? b.iv : surfaceIv(surf, k.strike, T);
    const fwd = b?.fwd ?? surf.spot;
    // Black-76 on the Deribit forward (r = 0 on the forward is equivalent)
    const g = bsGreeks(fwd, k.strike, T, 0, iv, k.type);
    const mark = b && b.mark > 0 ? b.mark : g.price;
    const depth = spec.minQty * 25; // summary feed has no depth; assume 25 lots at touch
    return {
      ...k,
      symbol: instrumentSymbol(k),
      bid: b ? b.bid : 0,
      ask: b ? b.ask : 0,
      mark,
      iv,
      delta: g.delta,
      gamma: g.gamma,
      vega: g.vega,
      theta: g.theta,
      rho: g.rho,
      oi: b?.oi ?? 0,
      volume: b?.volume ?? 0,
      bidSize: b && b.bid > 0 ? depth : 0,
      askSize: b && b.ask > 0 ? depth : 0,
    };
  }

  strikeForDelta(a: Asset, expiry: number, type: OptionType, targetDelta: number, now: number): number {
    let best = this.assets[a].spot;
    let bestErr = Infinity;
    for (const k of this.strikes(a, expiry, now)) {
      const q = this.quote({ asset: a, expiry, strike: k, type }, now);
      if (q.bid <= 0 && q.ask <= 0) continue; // skip untradeable strikes
      const err = Math.abs(q.delta - targetDelta);
      if (err < bestErr) {
        bestErr = err;
        best = k;
      }
    }
    return best;
  }

  /**
   * Estimated leverage/liquidation map: positions opened along the last 24h of prices at common leverages,
   * minus levels price has already traded through. This is an estimate (like public liquidation heatmaps), not exchange data.
   */
  private rebuildClusters(a: Asset) {
    const m = this.assets[a];
    const h = m.history;
    if (!h.length || !m.perpOi) {
      m.clusters = [];
      return;
    }
    const stride = Math.max(1, Math.floor(STEPS_PER_HOUR / 2));
    const idx: number[] = [];
    for (let i = h.length - 1; i >= Math.max(0, h.length - STEPS_PER_HOUR * 24); i -= stride) idx.push(i);
    const perEntry = (m.perpOi * LEVERAGED_SHARE) / Math.max(1, idx.length);
    const bucket = new Map<string, LiquidationCluster>();
    for (const i of idx) {
      const entry = h[i];
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = i; j < h.length; j++) {
        lo = Math.min(lo, h[j]);
        hi = Math.max(hi, h[j]);
      }
      for (const [lev, w] of LEVERAGES) {
        const longLiq = entry * (1 - 0.9 / lev);
        const shortLiq = entry * (1 + 0.9 / lev);
        for (const [side, px, alive] of [
          ['LONG', longLiq, lo > longLiq],
          ['SHORT', shortLiq, hi < shortLiq],
        ] as const) {
          if (!alive) continue;
          const b = Math.round((px / m.spot - 1) / 0.0025);
          const id = `${side}${b}`;
          const cur = bucket.get(id) ?? { side, price: m.spot * (1 + b * 0.0025), notional: 0, leverage: lev };
          cur.notional += perEntry * w;
          cur.leverage = Math.max(cur.leverage, lev);
          bucket.set(id, cur);
        }
      }
    }
    m.clusters = [...bucket.values()].filter((c) => Math.abs(c.price / m.spot - 1) < 0.15).sort((x, y) => y.notional - x.notional).slice(0, 30);
  }

  status(): DataSourceStatus {
    const age = Date.now() - this.lastBooks;
    let state = this.state;
    if (state === 'live' && age > 20000) state = 'stale';
    if (this.lastError && state !== 'connecting') state = age > 20000 ? 'error' : state;
    const detail = state === 'live' ? `Deribit · ${this.books.size} אופציות` : this.lastError || (state === 'connecting' ? 'מתחבר ל-Deribit…' : 'אין עדכון מעל 20 שניות');
    return { mode: 'live', state, detail, lastUpdate: this.lastBooks, latencyMs: (this.rpc as { lastLatencyMs?: number }).lastLatencyMs ?? 0, liqStream: this.liqStreamConnected() };
  }
}

const MONTHS: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

/** Deribit expiry code like 27SEP26 → 08:00 UTC timestamp */
export function expiryFromCode(code: string): number {
  const m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(code);
  if (!m || MONTHS[m[2]] === undefined) return 0;
  return Date.UTC(2000 + Number(m[3]), MONTHS[m[2]], Number(m[1]), 8, 0, 0);
}
