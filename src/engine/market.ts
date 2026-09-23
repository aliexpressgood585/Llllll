import { bsGreeks, bsPrice } from '../lib/blackScholes';
import { Rng } from '../lib/rng';
import { fmtExpiry } from '../lib/format';
import { ASSETS, ASSET_LIST, REGIME_HOURS, REGIME_NEXT, REGIME_PARAMS, RISK_FREE, STEP_YEARS, STEPS_PER_HOUR } from './config';
import { MS, listExpiries, yearsTo } from './time';
import type { InstrumentSpec, MarketSource } from './marketSource';
import type { Asset, AssetMarket, LiquidationCluster, MarketLiqEvent, OptionKey, OptionType, Quote, Regime } from './types';

const LEVERAGES = [10, 20, 25, 50, 75, 100];

export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function instrumentSymbol(k: OptionKey): string {
  const d = new Date(k.expiry);
  const yymmdd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `${k.asset}-${yymmdd}-${k.strike}-${k.type}`;
}

export function shortSymbol(k: OptionKey): string {
  return `${fmtExpiry(k.expiry)} ${k.strike}${k.type}`;
}

/** Surface parameters needed to price an option — lets risk code bump spot / vol without touching live state. */
export interface SurfaceState {
  spot: number;
  atmIv: number;
  longIv: number;
  skew: number;
  smile: number;
  /** live mode: market-implied vol by strike / tenor (sticky strike); shocks apply as atmIv - atm0 */
  lookup?: (strike: number, T: number) => number | null;
  atm0?: number;
}

export function surfaceIv(s: SurfaceState, strike: number, T: number, ivShift = 0): number {
  if (s.lookup) {
    const v = s.lookup(strike, T);
    if (v !== null) return Math.max(0.05, v + (s.atmIv - (s.atm0 ?? s.atmIv)) + ivShift);
  }
  const atmT = s.longIv + (s.atmIv - s.longIv) * Math.exp(-T / (10 / 365));
  const tEff = Math.max(T, 0.5 / 365);
  let x = Math.log(strike / s.spot) / (atmT * Math.sqrt(tEff));
  x = Math.max(-4, Math.min(4, x));
  const iv = atmT * (1 + 0.07 * s.skew * x + 0.025 * s.smile * x * x);
  return Math.max(0.08, iv + ivShift);
}

export function theoPrice(s: SurfaceState, k: OptionKey, now: number, ivShift = 0): number {
  const T = yearsTo(k.expiry, now);
  return bsPrice(s.spot, k.strike, T, RISK_FREE, surfaceIv(s, k.strike, T, ivShift), k.type);
}

export class MarketSim implements MarketSource {
  readonly kind = 'sim' as const;
  readonly regimeObservable = true;
  regime: Regime = 'NEUTRAL';
  regimeSince = 0;
  assets: Record<Asset, AssetMarket>;
  liqEvents: MarketLiqEvent[] = [];
  private rng: Rng;
  private anchors: Record<Asset, number> = { BTC: ASSETS.BTC.spot, ETH: ASSETS.ETH.spot, SOL: ASSETS.SOL.spot };

  constructor(rng: Rng, now: number) {
    this.rng = rng;
    this.regimeSince = now;
    this.assets = {} as Record<Asset, AssetMarket>;
    for (const a of ASSET_LIST) {
      const c = ASSETS[a];
      const m: AssetMarket = {
        asset: a,
        spot: c.spot,
        prevDayClose: c.spot,
        atmIv: c.baseVol * 0.9,
        longIv: c.baseVol,
        skew: -0.4,
        smile: 1,
        realizedVol: c.baseVol * 0.8,
        funding: 0.0001,
        perpOi: c.clusterScale * 900,
        history: [c.spot],
        ivHistory: [],
        clusters: [],
        liq1hLong: 0,
        liq1hShort: 0,
        liqWindow: [],
        lastReturn: 0,
      };
      for (let i = 0; i < 14; i++) m.clusters.push(this.spawnCluster(a, c.spot));
      // seed IV history so IV rank is meaningful from the start
      for (let i = 0; i < 24 * 20; i++) m.ivHistory.push(c.baseVol * (0.75 + 0.5 * rng.next()));
      this.assets[a] = m;
    }
  }

  surface(a: Asset): SurfaceState {
    const m = this.assets[a];
    return { spot: m.spot, atmIv: m.atmIv, longIv: m.longIv, skew: m.skew, smile: m.smile };
  }

  private spawnCluster(a: Asset, spot: number): LiquidationCluster {
    const c = ASSETS[a];
    const side: 'LONG' | 'SHORT' = this.rng.chance(0.5) ? 'LONG' : 'SHORT';
    const lev = this.rng.pick(LEVERAGES);
    // higher leverage clusters sit closer to price
    const dist = Math.min(0.16, (1 / lev) * this.rng.range(0.7, 2.2) + this.rng.range(0.012, 0.06));
    return {
      side,
      leverage: lev,
      price: side === 'LONG' ? spot * (1 - dist) : spot * (1 + dist),
      notional: c.clusterScale * this.rng.lognormal(0, 0.85),
    };
  }

  private stepRegime(now: number): boolean {
    const pLeave = 1 / (REGIME_HOURS[this.regime] * STEPS_PER_HOUR);
    if (!this.rng.chance(pLeave)) return false;
    let u = this.rng.next();
    for (const [next, p] of REGIME_NEXT[this.regime]) {
      u -= p;
      if (u <= 0) {
        this.regime = next;
        break;
      }
    }
    this.regimeSince = now;
    return true;
  }

  /** Advance one step. Returns market liquidation events that fired this step. */
  step(now: number): { events: MarketLiqEvent[]; regimeChanged: boolean } {
    const regimeChanged = this.stepRegime(now);
    const rp = REGIME_PARAMS[this.regime];
    const dt = STEP_YEARS;
    const zc = this.rng.fatTail();
    const commonJump = this.rng.chance(rp.jumpPerYear * dt) ? rp.jumpMean + rp.jumpVol * this.rng.normal() : 0;
    const events: MarketLiqEvent[] = [];
    const hourFrac = 1 / STEPS_PER_HOUR;

    for (const a of ASSET_LIST) {
      const c = ASSETS[a];
      const m = this.assets[a];
      const sigma = c.baseVol * rp.volMult;
      const z = 0.8 * zc + 0.6 * this.rng.normal();
      const idioJump = this.rng.chance(rp.jumpPerYear * 0.3 * dt) ? rp.jumpVol * this.rng.normal() : 0;
      const anchorPull = -10 * Math.log(m.spot / this.anchors[a]); // slow OU pull keeps multi-week paths plausible
      let ret = (rp.drift + anchorPull - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z + commonJump * c.beta + idioJump;
      const prevSpot = m.spot;
      let spot = prevSpot * Math.exp(ret);

      // --- liquidation cascade: crossing leverage clusters forces market orders that push price further
      let cascadeMove = 0;
      for (let iter = 0; iter < 8; iter++) {
        const hit = m.clusters.filter((cl) => (cl.side === 'LONG' ? spot <= cl.price : spot >= cl.price));
        if (!hit.length) break;
        m.clusters = m.clusters.filter((cl) => !hit.includes(cl));
        let longN = 0;
        let shortN = 0;
        for (const h of hit) (h.side === 'LONG' ? (longN += h.notional) : (shortN += h.notional));
        const impactPct = Math.max(-0.035, Math.min(0.035, ((shortN - longN) / c.liqDepthPer1Pct) * 0.006));
        if (Math.abs(cascadeMove + impactPct) > 0.12) break;
        cascadeMove += impactPct;
        spot *= 1 + impactPct;
        for (const [side, n] of [['LONG', longN], ['SHORT', shortN]] as const) {
          if (n <= 0) continue;
          const ev: MarketLiqEvent = { time: now, asset: a, side, notional: n, price: spot, impactPct };
          events.push(ev);
          m.liqWindow.push({ time: now, side, notional: n });
        }
      }
      ret = Math.log(spot / prevSpot);
      m.spot = spot;
      m.lastReturn = ret;

      // --- leverage rebuilds: clusters grow, new ones spawn near price, far ones decay away
      for (const cl of m.clusters) cl.notional *= 1 + 0.0002 + (this.regime === 'BULL' && cl.side === 'LONG' ? 0.0003 : 0);
      const spawnP = 0.05 + (this.regime === 'EXTREME' ? 0.08 : this.regime === 'BEAR' ? 0.02 : 0);
      if (this.rng.chance(spawnP) || m.clusters.length < 6) m.clusters.push(this.spawnCluster(a, spot));
      m.clusters = m.clusters.filter((cl) => Math.abs(cl.price / spot - 1) < 0.22);
      if (m.clusters.length > 30) {
        m.clusters.sort((x, y) => Math.abs(x.price - spot) - Math.abs(y.price - spot));
        m.clusters.length = 30;
      }
      m.liqWindow = m.liqWindow.filter((w) => now - w.time <= MS.HOUR);
      m.liq1hLong = m.liqWindow.filter((w) => w.side === 'LONG').reduce((s, w) => s + w.notional, 0);
      m.liq1hShort = m.liqWindow.filter((w) => w.side === 'SHORT').reduce((s, w) => s + w.notional, 0);

      // --- realised vol (EWMA of annualised squared returns)
      m.realizedVol = Math.sqrt(0.985 * m.realizedVol ** 2 + 0.015 * ((ret * ret) / dt));

      // --- implied vol dynamics: mean reversion to regime level + spot/vol correlation + cascade shock
      const target = c.baseVol * rp.ivMult + 0.75 * Math.max(0, m.realizedVol - c.baseVol * rp.ivMult);
      const kappa = this.regime === 'EXTREME' ? 0.7 : 0.22;
      const volOfVol = 0.035 * c.baseVol;
      const spotVol = ret < 0 ? -2.6 * ret : -0.7 * ret;
      m.atmIv += kappa * (target - m.atmIv) * hourFrac + volOfVol * Math.sqrt(hourFrac) * this.rng.normal() + spotVol * (m.atmIv / 0.6) + Math.abs(cascadeMove) * 1.4;
      m.atmIv = Math.max(c.baseVol * 0.35, Math.min(c.baseVol * 3.5, m.atmIv));
      const longTarget = c.baseVol * (1 + 0.35 * (rp.ivMult - 1));
      m.longIv += 0.04 * (longTarget - m.longIv) * hourFrac + 0.3 * (spotVol * (m.atmIv / 0.6)) + 0.01 * c.baseVol * Math.sqrt(hourFrac) * this.rng.normal();
      m.longIv = Math.max(c.baseVol * 0.5, Math.min(c.baseVol * 2, m.longIv));
      m.skew += 0.12 * (rp.skew - m.skew) * hourFrac + 0.05 * Math.sqrt(hourFrac) * this.rng.normal() + (ret < 0 ? ret * 4 : 0);
      m.skew = Math.max(-2, Math.min(0.8, m.skew));
      m.smile += 0.1 * (1 + (this.regime === 'EXTREME' ? 0.6 : 0) - m.smile) * hourFrac;

      // --- perp funding / OI respond to momentum
      const mom = m.history.length > 30 ? Math.log(spot / m.history[m.history.length - 30]) : 0;
      m.funding = Math.max(-0.003, Math.min(0.003, 0.9 * m.funding + 0.1 * (0.0001 + mom * 0.05)));
      m.perpOi = Math.max(c.clusterScale * 300, m.perpOi * (1 + 0.0004 * this.rng.normal()) - (cascadeMove !== 0 ? Math.abs(cascadeMove) * m.perpOi * 0.5 : 0) + c.clusterScale * 0.4);

      m.history.push(spot);
      if (m.history.length > 2400) m.history.splice(0, m.history.length - 2400);
    }
    this.liqEvents.push(...events);
    if (this.liqEvents.length > 200) this.liqEvents.splice(0, this.liqEvents.length - 200);
    return { events, regimeChanged };
  }

  spec(a: Asset): InstrumentSpec {
    const c = ASSETS[a];
    return { minQty: c.minQty, tick: c.tick, venues: c.venues };
  }

  /** Rescale an asset's price state to a new level (e.g. live index) keeping relative structure intact. */
  rebase(a: Asset, price: number): void {
    const m = this.assets[a];
    const f = price / m.spot;
    m.spot = price;
    m.prevDayClose *= f;
    m.history = m.history.map((p) => p * f);
    for (const cl of m.clusters) cl.price *= f;
    this.anchors[a] = price;
  }

  onHour(): void {
    for (const a of ASSET_LIST) {
      const m = this.assets[a];
      m.ivHistory.push(m.atmIv);
      if (m.ivHistory.length > 24 * 30) m.ivHistory.shift();
    }
  }

  onDay(): void {
    for (const a of ASSET_LIST) this.assets[a].prevDayClose = this.assets[a].spot;
  }

  expiries(now: number): number[] {
    return listExpiries(now);
  }

  strikes(a: Asset, expiry: number, now: number): number[] {
    const c = ASSETS[a];
    const T = yearsTo(expiry, now);
    const step = T > 20 / 365 ? c.strikeStep * 2 : c.strikeStep;
    const atm = Math.round(this.assets[a].spot / step) * step;
    const out: number[] = [];
    for (let i = -c.strikesEachSide; i <= c.strikesEachSide; i++) out.push(+(atm + i * step).toFixed(4));
    return out.filter((k) => k > 0);
  }

  openInterest(k: OptionKey, now: number): number {
    const c = ASSETS[k.asset];
    const s = this.assets[k.asset].spot;
    const T = yearsTo(k.expiry, now);
    const scale = k.asset === 'BTC' ? 420 : k.asset === 'ETH' ? 4200 : 38000;
    const x = Math.log(k.strike / s) / 0.12;
    const round = k.strike % (c.strikeStep * 5) === 0 ? 1.8 : 1;
    const skewBias = k.type === 'P' ? (k.strike < s ? 1.3 : 0.6) : k.strike > s ? 1.2 : 0.6;
    const tenor = 0.6 + Math.min(1.5, T * 20);
    return Math.round(scale * Math.exp(-x * x * 0.5) * (0.35 + hash01(instrumentSymbol(k))) * round * skewBias * tenor * 100) / 100;
  }

  quote(k: OptionKey, now: number): Quote {
    const c = ASSETS[k.asset];
    const surf = this.surface(k.asset);
    const T = yearsTo(k.expiry, now);
    const iv = surfaceIv(surf, k.strike, T);
    const g = bsGreeks(surf.spot, k.strike, T, RISK_FREE, iv, k.type);
    const x = Math.abs(Math.log(k.strike / surf.spot)) / Math.max(0.05, iv * Math.sqrt(Math.max(T, 1 / 365)));
    const stress = this.regime === 'EXTREME' ? 2.2 : this.regime === 'BEAR' ? 1.25 : 1;
    const shortDated = T < 1 / 365 ? 1.4 : 1;
    const half = (Math.max(2 * c.tick, g.price * (0.01 + 0.01 * Math.min(x, 3)), g.vega * 0.3) * stress * shortDated) / 2;
    const round = (v: number, up: boolean) => (up ? Math.ceil(v / c.tick) : Math.floor(v / c.tick)) * c.tick;
    const bid = Math.max(0, round(g.price - half, false));
    const ask = Math.max(c.tick, round(g.price + half, true));
    const h = hash01(instrumentSymbol(k) + Math.floor(now / 60e3));
    const oi = this.openInterest(k, now);
    const dayFrac = ((now % MS.DAY) / MS.DAY) * 0.9 + 0.1;
    return {
      ...k,
      symbol: instrumentSymbol(k),
      bid,
      ask,
      mark: g.price,
      iv,
      delta: g.delta,
      gamma: g.gamma,
      vega: g.vega,
      theta: g.theta,
      rho: g.rho,
      oi,
      volume: Math.round(oi * 0.22 * dayFrac * (0.5 + h) * 100) / 100,
      bidSize: +(c.minQty * Math.round(8 + 60 * h) / stress).toFixed(4),
      askSize: +(c.minQty * Math.round(8 + 60 * (1 - h)) / stress).toFixed(4),
    };
  }

  /** Find the strike on the listed grid whose delta is closest to targetDelta. */
  strikeForDelta(a: Asset, expiry: number, type: OptionType, targetDelta: number, now: number): number {
    const surf = this.surface(a);
    const T = yearsTo(expiry, now);
    let best = surf.spot;
    let bestErr = Infinity;
    for (const k of this.strikes(a, expiry, now)) {
      const d = bsGreeks(surf.spot, k, T, RISK_FREE, surfaceIv(surf, k, T), type).delta;
      const err = Math.abs(d - targetDelta);
      if (err < bestErr) {
        bestErr = err;
        best = k;
      }
    }
    return best;
  }
}
