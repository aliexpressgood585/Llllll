import { ASSETS, ASSET_LIST, STEPS_PER_HOUR } from './config';
import type { MarketSim } from './market';
import type { Asset, Regime, RegimeProbs } from './types';

const REGIMES: Regime[] = ['BULL', 'NEUTRAL', 'BEAR', 'EXTREME'];

export const argmaxRegime = (p: RegimeProbs): Regime => REGIMES.reduce((b, r) => (p[r] > p[b] ? r : b), 'NEUTRAL' as Regime);

/**
 * Multi-asset regime classifier. Observable features only (it never sees the hidden regime):
 * short / medium momentum z-scores, realised-vs-base vol, liquidation flow vs depth, funding.
 * Scores -> softmax -> EMA smoothing. Confidence = rolling hit-rate vs hidden regime (sim-only luxury).
 */
export class RegimeEngine {
  probs: Record<Asset, RegimeProbs>;
  private hits: number[] = [];

  constructor() {
    this.probs = {} as Record<Asset, RegimeProbs>;
    for (const a of ASSET_LIST) this.probs[a] = { BULL: 0.2, NEUTRAL: 0.55, BEAR: 0.2, EXTREME: 0.05 };
  }

  features(market: MarketSim, a: Asset) {
    const m = market.assets[a];
    const c = ASSETS[a];
    const h = m.history;
    const n1 = Math.min(h.length - 1, STEPS_PER_HOUR);
    const n4 = Math.min(h.length - 1, STEPS_PER_HOUR * 4);
    const r1 = n1 > 0 ? Math.log(h[h.length - 1] / h[h.length - 1 - n1]) : 0;
    const r4 = n4 > 0 ? Math.log(h[h.length - 1] / h[h.length - 1 - n4]) : 0;
    const hourVol = c.baseVol / Math.sqrt(24 * 365);
    const z1 = r1 / (hourVol * Math.sqrt(Math.max(1, n1 / STEPS_PER_HOUR)));
    const z4 = r4 / (hourVol * Math.sqrt(Math.max(1, n4 / STEPS_PER_HOUR)));
    const volZ = (m.realizedVol - c.baseVol * 0.8) / (c.baseVol * 0.4);
    const liqP = (m.liq1hLong + m.liq1hShort) / c.liqDepthPer1Pct;
    return { z1, z4, volZ, liqP, funding: m.funding };
  }

  update(market: MarketSim): void {
    for (const a of ASSET_LIST) {
      const f = this.features(market, a);
      const s = {
        BULL: 0.9 * f.z1 + 0.6 * f.z4 - 0.35 * Math.max(0, f.volZ) + f.funding * 400,
        BEAR: -0.9 * f.z1 - 0.6 * f.z4 + 0.25 * f.volZ - f.funding * 300,
        NEUTRAL: 1.4 - 0.55 * Math.abs(f.z1) - 0.35 * Math.abs(f.z4) - 0.6 * Math.max(0, f.volZ),
        EXTREME: -1.6 + 1.3 * Math.max(0, f.volZ) + 1.8 * f.liqP + 0.25 * Math.max(0, Math.abs(f.z1) - 2),
      };
      const mx = Math.max(s.BULL, s.BEAR, s.NEUTRAL, s.EXTREME);
      const e = REGIMES.map((r) => Math.exp((s[r] - mx) * 1.3));
      const sum = e.reduce((x, y) => x + y, 0);
      const p = this.probs[a];
      REGIMES.forEach((r, i) => {
        p[r] = 0.9 * p[r] + 0.1 * (e[i] / sum);
      });
    }
    const call = argmaxRegime(this.probs.BTC);
    this.hits.push(call === market.regime ? 1 : 0);
    if (this.hits.length > 720) this.hits.shift();
  }

  confidence(): number {
    if (this.hits.length < 10) return 0.5;
    return this.hits.reduce((a, b) => a + b, 0) / this.hits.length;
  }
}
