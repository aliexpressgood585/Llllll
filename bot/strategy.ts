import { CONFIG } from './config';
import type { Contract, OptionsMarket } from './market';
import type { BotStrategy } from './types';

export interface Plan {
  underlying: string;
  strategy: BotStrategy;
  legs: Contract[];
  score: number;
  reason: string;
}

const HOUR = 3600e3;

function expiryNear(m: OptionsMarket, u: string, days: number): number | null {
  const min = Date.now() + CONFIG.risk.minHoursToExpiry * HOUR;
  const list = m.expiries(u).filter((e) => e >= min);
  if (!list.length) return null;
  const target = Date.now() + days * 24 * HOUR;
  return list.reduce((b, e) => (Math.abs(e - target) < Math.abs(b - target) ? e : b), list[0]);
}

function atm(m: OptionsMarket, u: string, e: number, side: 'CALL' | 'PUT'): Contract | null {
  const s = m.spot(u);
  const cs = m.contractsFor(u, e, side);
  return cs.length ? cs.reduce((b, c) => (Math.abs(c.strike - s) < Math.abs(b.strike - s) ? c : b), cs[0]) : null;
}

/** contract whose Binance mark delta is closest to the target (only quoted strikes) */
function byDelta(m: OptionsMarket, u: string, e: number, side: 'CALL' | 'PUT', target: number): Contract | null {
  let best: Contract | null = null;
  let err = Infinity;
  for (const c of m.contractsFor(u, e, side)) {
    const q = m.quotes.get(c.symbol);
    if (!q || q.ask <= 0) continue;
    const d = Math.abs(q.delta - target);
    if (d < err) {
      err = d;
      best = c;
    }
  }
  return best;
}

/**
 * Buy-only signal set (a regular Binance account cannot write options):
 *  - LONG_STRADDLE when realised vol runs above Binance's ATM implied vol (options are cheap vs. how the market is moving),
 *    or when a liquidation burst signals a volatility event.
 *  - LONG_CALL / LONG_PUT on a confirmed multi-horizon momentum breakout, boosted by same-direction liquidations.
 */
export function candidates(m: OptionsMarket): Plan[] {
  const out: Plan[] = [];
  for (const u of m.underlyings) {
    const spot = m.spot(u);
    if (!spot) continue;
    const rv1h = m.realizedVol(u, 60);
    const rv16h = m.realizedVol(u, 960);
    const z1h = m.momentumZ(u, 60);
    const z4h = m.momentumZ(u, 240);
    const liqLong = m.liqSum(u, 15, 'LONG');
    const liqShort = m.liqSum(u, 15, 'SHORT');

    const eS = expiryNear(m, u, 3);
    if (eS) {
      const iv = m.atmIv(u, eS);
      const c = atm(m, u, eS, 'CALL');
      const p = atm(m, u, eS, 'PUT');
      if (iv > 0 && c && p) {
        const ratio = Math.max(rv16h, 0.6 * rv1h + 0.4 * rv16h) / iv;
        const liqBurst = Math.min(1, (liqLong + liqShort) / 5e6);
        const score = (ratio - 1.1) * 3 + liqBurst * 0.8;
        out.push({ underlying: u, strategy: 'LONG_STRADDLE', legs: [c, p], score, reason: `RV/IV ${ratio.toFixed(2)} (RV ${(rv16h * 100).toFixed(0)}% / IV ${(iv * 100).toFixed(0)}%) · liqs 15m $${((liqLong + liqShort) / 1e6).toFixed(1)}M` });
      }
    }

    const eD = expiryNear(m, u, 5);
    if (eD) {
      const up = z1h > 0 && z4h > 0;
      const strength = Math.min(Math.abs(z1h), Math.abs(z4h) * 1.5);
      const liqBoost = up ? Math.min(1, liqShort / 3e6) : Math.min(1, liqLong / 3e6);
      const score = (Math.sign(z1h) === Math.sign(z4h) ? strength - 1.8 : -1) + liqBoost * 0.7;
      const side = up ? 'CALL' : 'PUT';
      const leg = byDelta(m, u, eD, side, up ? 0.35 : -0.35);
      if (leg) out.push({ underlying: u, strategy: up ? 'LONG_CALL' : 'LONG_PUT', legs: [leg], score, reason: `מומנטום z1h ${z1h.toFixed(1)} · z4h ${z4h.toFixed(1)} · חיסולים נגדיים $${((up ? liqShort : liqLong) / 1e6).toFixed(1)}M` });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
