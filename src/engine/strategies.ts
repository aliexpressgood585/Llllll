import { fmtExpiry } from '../lib/format';
import { Rng } from '../lib/rng';
import { ASSETS, STRATEGY_RULES } from './config';
import type { MarketSim } from './market';
import { MS } from './time';
import type { Asset, OptionKey, OptionType, RegimeProbs, StrategyKind } from './types';

export interface LegSpec extends OptionKey {
  ratio: number; // +1 long, -1 short per unit
}

export interface StrategyPlan {
  kind: StrategyKind;
  asset: Asset;
  legs: LegSpec[];
  label: string;
  tag: string;
  note: string;
  score: number;
}

function expiryNear(market: MarketSim, now: number, targetDays: number, minHours = 3): number {
  const list = market.expiries(now).filter((e) => e - now > minHours * MS.HOUR);
  return list.reduce((b, e) => (Math.abs((e - now) / MS.DAY - targetDays) < Math.abs((b - now) / MS.DAY - targetDays) ? e : b), list[0]);
}

function leg(asset: Asset, expiry: number, strike: number, type: OptionType, ratio: number): LegSpec {
  return { asset, expiry, strike, type, ratio };
}

const k = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}K`.replace('.0K', 'K') : String(v));

export function buildPlan(kind: StrategyKind, asset: Asset, market: MarketSim, now: number, bias: 1 | -1 = 1): StrategyPlan {
  const sd = (e: number, t: OptionType, d: number) => market.strikeForDelta(asset, e, t, d, now);
  const tagBase = STRATEGY_RULES[kind].label;
  let legs: LegSpec[] = [];
  let label = '';
  let expiry = now;
  switch (kind) {
    case 'IRON_CONDOR': {
      expiry = expiryNear(market, now, 4);
      const sc = sd(expiry, 'C', 0.2);
      const lc = Math.max(sd(expiry, 'C', 0.07), sc + ASSETS[asset].strikeStep);
      const sp = sd(expiry, 'P', -0.2);
      const lp = Math.min(sd(expiry, 'P', -0.07), sp - ASSETS[asset].strikeStep);
      legs = [leg(asset, expiry, sc, 'C', -1), leg(asset, expiry, lc, 'C', 1), leg(asset, expiry, sp, 'P', -1), leg(asset, expiry, lp, 'P', 1)];
      label = `${asset} IC ${k(sc)}/${k(sp)}`;
      break;
    }
    case 'SHORT_STRANGLE': {
      expiry = expiryNear(market, now, 1.5, 6);
      const sc = sd(expiry, 'C', 0.18);
      const sp = sd(expiry, 'P', -0.18);
      legs = [leg(asset, expiry, sc, 'C', -1), leg(asset, expiry, sp, 'P', -1)];
      label = `${asset} SS ${k(sc)}C/${k(sp)}P`;
      break;
    }
    case 'CALENDAR': {
      const near = expiryNear(market, now, 2, 8);
      const far = expiryNear(market, now, 21);
      const atm = sd(near, 'C', 0.5);
      legs = [leg(asset, near, atm, 'C', -1), leg(asset, far, atm, 'C', 1)];
      expiry = near;
      label = `${asset} CAL ${k(atm)}`;
      break;
    }
    case 'RISK_REVERSAL': {
      expiry = expiryNear(market, now, 7);
      const c = sd(expiry, 'C', 0.25);
      const p = sd(expiry, 'P', -0.25);
      legs = bias > 0 ? [leg(asset, expiry, c, 'C', 1), leg(asset, expiry, p, 'P', -1)] : [leg(asset, expiry, c, 'C', -1), leg(asset, expiry, p, 'P', 1)];
      label = `${asset} RR ${k(c)}C/${k(p)}P ${bias > 0 ? '▲' : '▼'}`;
      break;
    }
    case 'DIRECTIONAL': {
      expiry = expiryNear(market, now, 3, 6);
      const t: OptionType = bias > 0 ? 'C' : 'P';
      const s = sd(expiry, t, bias > 0 ? 0.35 : -0.35);
      legs = [leg(asset, expiry, s, t, 1)];
      label = `${asset} ${k(s)}${t} ${bias > 0 ? 'לונג קול' : 'לונג פוט'}`;
      break;
    }
    case 'LONG_STRADDLE': {
      expiry = expiryNear(market, now, 1.5, 8);
      const atm = sd(expiry, 'C', 0.5);
      legs = [leg(asset, expiry, atm, 'C', 1), leg(asset, expiry, atm, 'P', 1)];
      label = `${asset} STRDL ${k(atm)}`;
      break;
    }
  }
  const tag = `${tagBase}-${fmtExpiry(expiry).slice(0, 5)}`;
  return { kind, asset, legs, label, tag, note: '', score: 0 };
}

export interface SignalContext {
  probs: RegimeProbs;
  ivRank: number;
  termSpread: number; // front atm - long iv (vol points / 100)
  cascadeRisk: number; // clustered notional within 3% / depth
  momentum: number; // 1h momentum z
}

/** Score candidate structures for an asset given regime probabilities and vol state. Aggressive thresholds. */
export function candidates(_asset: Asset, ctx: SignalContext, rng: Rng): { kind: StrategyKind; bias: 1 | -1; score: number; note: string }[] {
  const p = ctx.probs;
  const out: { kind: StrategyKind; bias: 1 | -1; score: number; note: string }[] = [];
  const noise = () => 0.12 * rng.normal();
  out.push({ kind: 'IRON_CONDOR', bias: 1, score: 0.15 + p.NEUTRAL * 1.1 + ctx.ivRank * 0.5 - p.EXTREME * 1.5 + noise(), note: `ניטרלי ${(p.NEUTRAL * 100).toFixed(0)}% / IVR ${(ctx.ivRank * 100).toFixed(0)}` });
  out.push({ kind: 'SHORT_STRANGLE', bias: 1, score: 0.1 + p.NEUTRAL * 1.2 + ctx.ivRank * 0.7 - p.EXTREME * 2 + noise(), note: `קציר תנודתיות יקרה IVR ${(ctx.ivRank * 100).toFixed(0)}` });
  out.push({ kind: 'CALENDAR', bias: 1, score: 0.45 + Math.max(-0.4, Math.min(0.45, ctx.termSpread * 4)) + p.NEUTRAL * 0.3 + noise(), note: `מבנה עיתי ${(ctx.termSpread * 100).toFixed(1)}v` });
  const dir: 1 | -1 = p.BULL >= p.BEAR ? 1 : -1;
  const dirP = Math.max(p.BULL, p.BEAR);
  out.push({ kind: 'RISK_REVERSAL', bias: dir, score: dirP * 1.5 + Math.abs(ctx.momentum) * 0.08 - 0.05 + noise(), note: `${dir > 0 ? 'שורי' : 'דובי'} ${(dirP * 100).toFixed(0)}%` });
  out.push({ kind: 'DIRECTIONAL', bias: dir, score: dirP * 1.4 + Math.abs(ctx.momentum) * 0.15 + noise(), note: `מומנטום z ${ctx.momentum.toFixed(1)}` });
  out.push({ kind: 'LONG_STRADDLE', bias: 1, score: p.EXTREME * 2.4 + ctx.cascadeRisk * 0.8 + (1 - ctx.ivRank) * 0.35 + noise(), note: `סיכון מפל חיסולים ${(ctx.cascadeRisk * 100).toFixed(0)}%` });
  return out.sort((a, b) => b.score - a.score);
}
