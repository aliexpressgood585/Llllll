import { Rng } from '../lib/rng';
import { ASSETS } from './config';
import { tradeFee, liquidationFee } from './fees';
import { MarketSim, hash01 } from './market';
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
  constructor(private market: MarketSim, private rng: Rng) {}

  execute(req: ExecRequest, now: number): ExecResult {
    const c = ASSETS[req.asset];
    const q = this.market.quote(req, now);
    if (!Number.isFinite(req.qty) || req.qty === 0 || req.expiry <= now ||
        Math.abs(req.qty / c.minQty - Math.round(req.qty / c.minQty)) > 1e-7) {
      return { ok: false, reason: 'INVALID_ORDER', price: 0, touch: 0, venue: req.preferVenue ?? 'BINANCE', fee: 0, slippageBp: 0, latencyMs: 0 };
    }
    const buy = req.qty > 0;
    const size = Math.abs(req.qty);
    const stressed = this.market.regime === 'EXTREME';

    // A closing leg must use its original venue and that venue's own quote.
    const venues = req.preferVenue ? c.venues.filter(v => v === req.preferVenue) : c.venues;
    if (!venues.length) return { ok: false, reason: 'UNSUPPORTED_VENUE', price: 0, touch: 0, venue: req.preferVenue ?? 'BINANCE', fee: 0, slippageBp: 0, latencyMs: 0 };
    const touches = venues.map(venue => {
      const offset = venue === 'BINANCE' ? 1 : 1 + 0.006 * (hash01(`${q.symbol}${venue}${Math.floor(now / 120e3)}`) - 0.5);
      const touch = (buy ? q.ask : q.bid) * offset;
      return { venue, touch, cost: (buy ? touch : -touch) + tradeFee(venue, this.market.assets[req.asset].spot, 1, touch) };
    }).sort((a, b) => a.cost - b.cost);
    const { venue, touch } = touches[0];

    const latencyMs = Math.min(900, this.rng.lognormal(Math.log(stressed ? 42 : 16), stressed ? 0.7 : 0.35));

    if (!req.liquidation) {
      const rejectP = stressed ? 0.035 : 0.01;
      if (this.rng.chance(rejectP)) return { ok: false, reason: 'VENUE_REJECT', price: 0, touch, venue, fee: 0, slippageBp: 0, latencyMs };
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
    px = Math.max(c.tick, (buy ? Math.ceil(px / c.tick) : Math.floor(px / c.tick)) * c.tick);
    const touchRef = Math.max(c.tick, touch);
    const slippageBp = ((buy ? px - touchRef : touchRef - px) / touchRef) * 1e4;
    let fee = tradeFee(venue, this.market.assets[req.asset].spot, size, px);
    if (req.liquidation) fee += liquidationFee(this.market.assets[req.asset].spot, size);
    return { ok: true, price: px, touch: touchRef, venue, fee, slippageBp, latencyMs };
  }
}

