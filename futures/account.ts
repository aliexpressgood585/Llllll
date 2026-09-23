/**
 * Paper USDⓈ-M futures account with Binance's mechanics: isolated margin, taker fees on both legs,
 * market orders walked through the real order book, funding every settlement, and liquidation at the
 * isolated liquidation price (maintenance-margin model of the first tier).
 */
import type { Book } from './feed';

export type Side = 'LONG' | 'SHORT';
export interface Position {
  id: string; symbol: string; side: Side; qty: number; entry: number; lev: number; margin: number;
  stop: number; target: number; liq: number; riskUsd: number; rDist: number; openedAt: number;
  fees: number; funding: number; beMoved: boolean; reason: string; mmr: number;
}
export interface Trade {
  id: string; symbol: string; side: Side; qty: number; entry: number; exit: number; lev: number;
  openedAt: number; closedAt: number; gross: number; fees: number; funding: number; net: number; r: number; reason: string;
}
export interface AccountState {
  capital: number; wallet: number; positions: Position[]; trades: Trade[];
  peak: number; day: string; dayStart: number; feesPaid: number; fundingNet: number;
  halted: string | null; paused: boolean; curve: { t: number; e: number }[];
}

export const sign = (s: Side) => (s === 'LONG' ? 1 : -1);

/** Isolated liquidation price: position equity (margin + uPnL) equals maintenance margin. */
export function liqPrice(side: Side, qty: number, entry: number, margin: number, mmr: number) {
  return side === 'LONG' ? Math.max(0, (qty * entry - margin) / (qty * (1 - mmr))) : (margin + qty * entry) / (qty * (1 + mmr));
}

/** Walk the book for a market order. Returns filled qty and average price, stopping at the slippage limit. */
export function walk(book: Book, side: 'BUY' | 'SELL', qty: number, maxSlip: number) {
  const levels = side === 'BUY' ? book.asks : book.bids;
  if (!levels.length) return { filled: 0, avg: 0, best: 0 };
  const best = levels[0][0];
  const limit = side === 'BUY' ? best * (1 + maxSlip) : best * (1 - maxSlip);
  let left = qty, cost = 0;
  for (const [p, q] of levels) {
    if (side === 'BUY' ? p > limit : p < limit) break;
    const take = Math.min(left, q);
    cost += take * p; left -= take;
    if (left <= 1e-12) break;
  }
  const filled = qty - Math.max(0, left);
  return { filled, avg: filled > 0 ? cost / filled : 0, best };
}

export class Account {
  s: AccountState;
  constructor(capital: number, saved?: AccountState) {
    this.s = saved ?? { capital, wallet: capital, positions: [], trades: [], peak: capital, day: '', dayStart: capital, feesPaid: 0, fundingNet: 0, halted: null, paused: false, curve: [] };
  }
  unrealized(marks: Map<string, number>) {
    return this.s.positions.reduce((s, p) => s + sign(p.side) * (marks.get(p.symbol) ?? p.entry) * p.qty - sign(p.side) * p.entry * p.qty, 0);
  }
  equity(marks: Map<string, number>) { return this.s.wallet + this.unrealized(marks); }
  marginUsed() { return this.s.positions.reduce((s, p) => s + p.margin, 0); }
  available(marks: Map<string, number>) { return this.equity(marks) - this.marginUsed(); }

  open(p: Omit<Position, 'fees' | 'funding' | 'beMoved'>, fee: number) {
    const pos: Position = { ...p, fees: fee, funding: 0, beMoved: false };
    this.s.wallet -= fee; this.s.feesPaid += fee;
    this.s.positions.push(pos);
    return pos;
  }

  close(p: Position, exit: number, fee: number, at: number, reason: string, liquidation = false): Trade {
    const gross = liquidation ? -p.margin : sign(p.side) * (exit - p.entry) * p.qty;
    this.s.wallet += gross - fee; this.s.feesPaid += fee;
    this.s.positions = this.s.positions.filter((x) => x.id !== p.id);
    const fees = p.fees + fee;
    const net = gross - fees + p.funding;
    const t: Trade = { id: p.id, symbol: p.symbol, side: p.side, qty: p.qty, entry: p.entry, exit, lev: p.lev, openedAt: p.openedAt, closedAt: at, gross, fees, funding: p.funding, net, r: p.riskUsd > 0 ? net / p.riskUsd : 0, reason };
    this.s.trades.push(t);
    if (this.s.trades.length > 2000) this.s.trades.splice(0, this.s.trades.length - 2000);
    return t;
  }

  /** Funding settlement: longs pay shorts when the rate is positive. Returns the amount credited (negative = paid). */
  fund(p: Position, mark: number, rate: number) {
    const amt = -sign(p.side) * p.qty * mark * rate;
    p.funding += amt; this.s.wallet += amt; this.s.fundingNet += amt;
    return amt;
  }
}
