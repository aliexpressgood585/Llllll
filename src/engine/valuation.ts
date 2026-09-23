import { bsGreeks } from '../lib/blackScholes';
import { Rng } from '../lib/rng';
import { ASSETS, ASSET_LIST, RISK, RISK_FREE } from './config';
import { MarketSim, SurfaceState, surfaceIv, theoPrice } from './market';
import { MS, yearsTo } from './time';
import type { Asset, Leg, Strategy } from './types';

export type Surfaces = Record<Asset, SurfaceState>;

export function surfacesOf(market: MarketSim): Surfaces {
  return { BTC: market.surface('BTC'), ETH: market.surface('ETH'), SOL: market.surface('SOL') };
}

/** Shift every asset's spot by a BTC-led move (scaled by beta) and IV by an absolute amount (vol points / 100). */
export function shockSurfaces(s: Surfaces, btcMove: number, ivShift: number): Surfaces {
  const out = {} as Surfaces;
  for (const a of ASSET_LIST) {
    const move = Math.max(-0.95, btcMove * ASSETS[a].beta);
    out[a] = { ...s[a], spot: s[a].spot * (1 + move), atmIv: Math.max(0.05, s[a].atmIv + ivShift), longIv: Math.max(0.05, s[a].longIv + ivShift * 0.6) };
  }
  return out;
}

export function legValue(leg: Leg, s: Surfaces, now: number): number {
  return theoPrice(s[leg.asset], leg, now) * leg.qty;
}

export function strategyValue(st: Strategy, s: Surfaces, now: number): number {
  let v = 0;
  for (const l of st.legs) v += legValue(l, s, now);
  return v;
}

export function hasShorts(st: Strategy): boolean {
  return st.legs.some((l) => l.qty < 0);
}

const SPOT_SHOCKS = [-0.3, -0.2, -0.12, -0.06, 0, 0.06, 0.12, 0.2, 0.3];
const VOL_SHOCKS = [-0.25, 0, 0.4]; // relative to ATM iv

/**
 * Risk-based initial margin (portfolio-margin style, similar in spirit to Deribit PM / Binance options):
 * worst loss across spot (vol-scaled) × IV shocks, plus a floor on short notional. Long-only structures need no margin.
 */
export function initialMargin(st: Strategy, base: Surfaces, now: number): number {
  if (!hasShorts(st)) return 0;
  const a = st.asset;
  const surf = base[a];
  const volScale = ASSETS[a].baseVol / 0.55;
  const v0 = strategyValue(st, base, now);
  let worst = 0;
  for (const sm of SPOT_SHOCKS) {
    for (const vm of VOL_SHOCKS) {
      const sh: SurfaceState = { ...surf, spot: surf.spot * (1 + sm * volScale), atmIv: surf.atmIv * (1 + vm), longIv: surf.longIv * (1 + vm * 0.6) };
      let v = 0;
      for (const l of st.legs) v += theoPrice(sh, l, now) * l.qty;
      worst = Math.min(worst, v - v0);
    }
  }
  // floor only on uncovered (naked) short quantity per option type
  let naked = 0;
  for (const t of ['C', 'P'] as const) {
    const q = st.legs.filter((l) => l.type === t).reduce((s, l) => s + l.qty, 0);
    if (q < 0) naked -= q;
  }
  return -worst * 1.05 + 0.01 * surf.spot * naked;
}

export function maintenanceMargin(im: number): number {
  return im * RISK.mmRatio;
}

export interface GreekTotals {
  delta: number; // base units
  deltaUsd: number;
  gammaUsd: number; // $ delta change per 1% move
  vega: number; // $ per vol pt
  theta: number; // $ per day
  rho: number;
}

export function legGreeks(l: Leg, s: Surfaces, now: number) {
  const surf = s[l.asset];
  const T = yearsTo(l.expiry, now);
  return bsGreeks(surf.spot, l.strike, T, RISK_FREE, surfaceIv(surf, l.strike, T), l.type);
}

export function strategyGreeks(st: Strategy, s: Surfaces, now: number): GreekTotals {
  const spot = s[st.asset].spot;
  const g: GreekTotals = { delta: 0, deltaUsd: 0, gammaUsd: 0, vega: 0, theta: 0, rho: 0 };
  for (const l of st.legs) {
    const lg = legGreeks(l, s, now);
    g.delta += lg.delta * l.qty;
    g.gammaUsd += lg.gamma * l.qty * spot * spot * 0.01;
    g.vega += lg.vega * l.qty;
    g.theta += lg.theta * l.qty;
    g.rho += lg.rho * l.qty;
  }
  g.deltaUsd = g.delta * spot;
  return g;
}

export function portfolioValue(strats: Strategy[], s: Surfaces, now: number): number {
  let v = 0;
  for (const st of strats) v += strategyValue(st, s, now);
  return v;
}

/** 1-day Monte Carlo VaR / ES with full revaluation, correlated fat-tailed returns and IV shocks. */
export function monteCarloVar(strats: Strategy[], market: MarketSim, now: number, rng: Rng, draws = 400) {
  if (!strats.length) return { var95: 0, es95: 0, worst: 0 };
  const base = surfacesOf(market);
  const v0 = portfolioValue(strats, base, now);
  const t1 = now + MS.DAY;
  const pnls: number[] = [];
  const stress = market.regime === 'EXTREME' ? 1.8 : market.regime === 'BEAR' ? 1.2 : 1;
  for (let i = 0; i < draws; i++) {
    const zc = rng.fatTail();
    const shocked = {} as Surfaces;
    for (const a of ASSET_LIST) {
      const m = market.assets[a];
      const dailyVol = (Math.max(m.realizedVol, m.atmIv * 0.8) / Math.sqrt(365)) * stress;
      const r = dailyVol * (0.8 * zc + 0.6 * rng.normal());
      const ivMove = -1.8 * r * m.atmIv + 0.04 * m.atmIv * rng.normal();
      shocked[a] = { ...base[a], spot: base[a].spot * Math.exp(r), atmIv: Math.max(0.05, base[a].atmIv + ivMove), longIv: Math.max(0.05, base[a].longIv + ivMove * 0.5) };
    }
    pnls.push(portfolioValue(strats, shocked, t1) - v0);
  }
  pnls.sort((x, y) => x - y);
  const cut = Math.max(1, Math.floor(draws * 0.05));
  const var95 = -pnls[cut];
  const es95 = -pnls.slice(0, cut).reduce((x, y) => x + y, 0) / cut;
  return { var95: Math.max(0, var95), es95: Math.max(0, es95), worst: -pnls[0] };
}
