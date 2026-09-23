import { randomUUID } from 'node:crypto';
import type { BinanceClient, DepthResp } from './binanceClient';
import { CONFIG } from './config';
import { tradeFee } from './fees';
import { floorTo, fmtStep, roundTo, type Contract, type OptionsMarket } from './market';

export interface OrderIntent {
  contract: Contract;
  side: 'BUY' | 'SELL';
  qty: number;
  /** worst acceptable price (IOC limit) */
  limit: number;
}

export interface Execution {
  ok: boolean;
  reason?: string;
  filledQty: number;
  avgPrice: number;
  fee: number;
  /** best price on the book when the order was sent */
  touch: number;
  bookTime: number;
  levels: number;
  orderId?: string;
}

/** Walk an order-book side up to a limit price. Pure; exported for tests. */
export function walkBook(book: DepthResp, side: 'BUY' | 'SELL', qty: number, limit: number, step: number) {
  const levels = (side === 'BUY' ? book.asks : book.bids)
    .map(([p, q]) => [Number(p), Number(q)] as [number, number])
    .filter(([p, q]) => p > 0 && q > 0 && (side === 'BUY' ? p <= limit + 1e-12 : p >= limit - 1e-12))
    .sort((a, b) => (side === 'BUY' ? a[0] - b[0] : b[0] - a[0]));
  let remaining = qty;
  let cost = 0;
  let used = 0;
  const fills: [number, number][] = [];
  for (const [p, q] of levels) {
    if (remaining <= 1e-12) break;
    const take = Math.min(remaining, q);
    fills.push([p, take]);
    cost += p * take;
    remaining -= take;
    used++;
  }
  const filled = floorTo(qty - remaining, step);
  // if rounding trimmed quantity, trim from the worst level
  let excess = qty - remaining - filled;
  while (excess > 1e-12 && fills.length) {
    const last = fills[fills.length - 1];
    const cut = Math.min(excess, last[1]);
    last[1] -= cut;
    cost -= cut * last[0];
    excess -= cut;
    if (last[1] <= 1e-12) fills.pop();
  }
  const touch = Number((side === 'BUY' ? book.asks : book.bids)[0]?.[0] ?? 0);
  return { filled, avg: filled > 0 ? cost / filled : 0, fills, touch, levels: used };
}

export interface Broker {
  readonly kind: 'paper' | 'live';
  /** max quantity fillable right now within the limit (paper: from the book; live: same pre-check) */
  fillable(i: OrderIntent): Promise<number>;
  execute(i: OrderIntent): Promise<Execution>;
}

/** Paper broker: fills against a fresh Binance order-book snapshot with IOC-limit semantics and Binance fee rules. */
export class PaperBroker implements Broker {
  readonly kind = 'paper' as const;
  constructor(private market: OptionsMarket) {}

  async fillable(i: OrderIntent): Promise<number> {
    const book = await this.market.depth(i.contract.symbol);
    return walkBook(book, i.side, i.contract.maxQty || 1e9, i.limit, i.contract.step).filled;
  }

  async execute(i: OrderIntent): Promise<Execution> {
    const c = i.contract;
    const qty = floorTo(i.qty, c.step);
    if (!(qty >= c.minQty)) return { ok: false, reason: `qty ${qty} < min ${c.minQty}`, filledQty: 0, avgPrice: 0, fee: 0, touch: 0, bookTime: 0, levels: 0 };
    const book = await this.market.depth(c.symbol);
    const limit = roundTo(i.limit, c.tick, i.side === 'BUY');
    const w = walkBook(book, i.side, qty, limit, c.step);
    if (w.filled < c.minQty) return { ok: false, reason: w.touch ? 'no liquidity within limit' : 'empty book side', filledQty: 0, avgPrice: 0, fee: 0, touch: w.touch, bookTime: book.T, levels: 0 };
    const index = this.market.spot(c.underlying);
    const fee = w.fills.reduce((a, [p, q]) => a + tradeFee(c, index, p, q), 0);
    return { ok: true, filledQty: w.filled, avgPrice: w.avg, fee, touch: w.touch, bookTime: book.T, levels: w.levels, orderId: `paper-${randomUUID().slice(0, 8)}` };
  }
}

/**
 * Live broker: real IOC LIMIT orders on Binance Options. Disabled unless BOT_MODE=live, keys are set and
 * LIVE_CONFIRM=I_ACCEPT_REAL_MONEY_RISK. Fees are taken from Binance's order response.
 */
export class LiveBroker implements Broker {
  readonly kind = 'live' as const;
  constructor(private api: BinanceClient, private market: OptionsMarket) {
    if (CONFIG.liveConfirm !== 'I_ACCEPT_REAL_MONEY_RISK') throw new Error('live mode requires LIVE_CONFIRM=I_ACCEPT_REAL_MONEY_RISK');
  }

  async fillable(i: OrderIntent): Promise<number> {
    const book = await this.market.depth(i.contract.symbol);
    return walkBook(book, i.side, i.contract.maxQty || 1e9, i.limit, i.contract.step).filled;
  }

  async execute(i: OrderIntent): Promise<Execution> {
    const c = i.contract;
    const qty = floorTo(i.qty, c.step);
    if (!(qty >= c.minQty)) return { ok: false, reason: `qty ${qty} < min ${c.minQty}`, filledQty: 0, avgPrice: 0, fee: 0, touch: 0, bookTime: 0, levels: 0 };
    const book = await this.market.depth(c.symbol);
    const touch = Number((i.side === 'BUY' ? book.asks : book.bids)[0]?.[0] ?? 0);
    const limit = roundTo(i.limit, c.tick, i.side === 'BUY');
    const clientOrderId = `nx${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
    try {
      const r = await this.api.placeOrder({ symbol: c.symbol, side: i.side, quantity: fmtStep(qty, c.step), price: fmtStep(limit, c.tick), clientOrderId, reduceOnly: i.side === 'SELL' });
      const filled = Number(r.executedQty) || 0;
      return { ok: filled > 0, reason: filled > 0 ? undefined : `not filled (${r.status})`, filledQty: filled, avgPrice: Number(r.avgPrice) || 0, fee: Math.abs(Number(r.fee) || 0), touch, bookTime: book.T, levels: 0, orderId: String(r.orderId) };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e), filledQty: 0, avgPrice: 0, fee: 0, touch, bookTime: book.T, levels: 0 };
    }
  }
}
