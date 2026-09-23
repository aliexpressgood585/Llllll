import { Rng } from '../lib/rng';
import { tradeFee, liquidationFee } from './fees';
import { hash01 } from './market';
import type { MarketSource } from './marketSource';
import type { OptionKey, Venue } from './types';

export interface ExecRequest extends OptionKey {
  /** signed qty: > 0 buy, < 0 sell */
  qty: number;
  liquidation?: boolean;
  preferVenue?: Venue;
}

export interface ExecResult {
  ok: boolean;
  reason?: string;
  price: number;
  touch: number;
  venue: Venue;
  fee: number;
  slippageBp: number;
  latencyMs: number;
}

/**
 * Venue adapter interface. The simulator implements it; a live adapter (Binance EAPI / Deribit JSON-RPC)
 * can implement the same contract — see src/adapters.
 */
export interface ExecutionVenue {
  execute(req: ExecRequest, now: number): ExecResult;
}

/** Simulated smart order router across Binance Options + Deribit with realistic microstructure. */
export class SimExecution implements ExecutionVenue {
  constructor(private market: MarketSource, private rng: Rng) {}

  execute(req: ExecRequest, now: number): ExecResult {
    const c = this.market.spec(req.asset);
    const q = this.market.quote(req, now);
    const buy = req.qty > 0;
    const size = Math.abs(req.qty);
    const stressed = this.market.regime === 'EXTREME';

    // route: pick best touch among venues listing the asset
    let venue: Venue = c.venues[0];
    let touch = buy ? q.ask : q.bid;
    for (const v of c.venues) {
      if (v === c.venues[0]) continue;
      const off = 1 + 0.006 * (hash01(`${q.symbol}${v}${Math.floor(now / 120e3)}`) - 0.5);
      const t = buy ? q.ask * off : q.bid * off;
      if ((buy && t < touch) || (!buy && t > touch)) {
        touch = t;
        venue = v;
      }
    }
    if (req.preferVenue && c.venues.includes(req.preferVenue)) venue = req.preferVenue;

    const latencyMs = Math.min(900, this.rng.lognormal(Math.log(stressed ? 42 : 16), stressed ? 0.7 : 0.35));

    if (!req.liquidation) {
      const rejectP = stressed ? 0.035 : 0.01;
      if (this.rng.chance(rejectP)) return { ok: false, reason: 'VENUE_REJECT', price: 0, touch, venue, fee: 0, slippageBp: 0, latencyMs };
      if (buy && q.ask <= 0) return { ok: false, reason: 'NO_ASK', price: 0, touch, venue, fee: 0, slippageBp: 0, latencyMs };
      if (!buy && q.bid <= 0) return { ok: false, reason: 'NO_BID', price: 0, touch, venue, fee: 0, slippageBp: 0, latencyMs };
    }

    // book walk: size beyond top-of-book pays further into the spread
    const halfSpread = Math.max(c.tick, (q.ask - q.bid) / 2);
    const topSize = Math.max(c.minQty, buy ? q.askSize : q.bidSize);
    const walk = halfSpread * Math.max(0, size / topSize - 1) * 0.25;
    // latency drift / adverse selection: quote moves against us while order is in flight
    const drift = halfSpread * 0.15 * Math.abs(this.rng.normal()) * (latencyMs / 20);
    let px = buy ? touch + walk + drift : touch - walk - drift;
    if (req.liquidation) {
      // liquidation engine crosses aggressively: extra 4% of premium + 2 ticks
      px = buy ? px * 1.04 + 2 * c.tick : px * 0.96 - 2 * c.tick;
    }
    px = Math.max(c.tick, Math.round(px / c.tick) * c.tick);
    const touchRef = Math.max(c.tick, touch);
    const slippageBp = ((buy ? px - touchRef : touchRef - px) / touchRef) * 1e4;
    let fee = tradeFee(venue, this.market.assets[req.asset].spot, size, px);
    if (req.liquidation) fee += liquidationFee(this.market.assets[req.asset].spot, size);
    return { ok: true, price: px, touch: touchRef, venue, fee, slippageBp, latencyMs };
  }
}
