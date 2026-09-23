import { CONFIG } from './config';
import type { Contract } from './market';

/**
 * Binance Options fees (Binance support FAQ "Binance Options Trading Fees"):
 *   Transaction fee = min(feeRate × index × unit, 10% × traded price) × size
 *   Exercise fee    = min(exerciseRate × settlement × unit, 10% × option value) × size
 * The per-symbol takerFeeRate from exchangeInfo is used when present; verify against your VIP tier.
 */
export function tradeFee(c: Contract, index: number, price: number, qty: number): number {
  const rate = c.takerFee ?? CONFIG.fees.taker;
  return Math.min(rate * index * c.unit, CONFIG.fees.cap * price) * qty;
}

export function exerciseFee(c: Contract, settlement: number, valuePerContract: number, qty: number): number {
  if (valuePerContract <= 0) return 0;
  return Math.min(CONFIG.fees.exercise * settlement * c.unit, CONFIG.fees.cap * valuePerContract) * qty;
}

export function intrinsic(c: Contract, settlement: number): number {
  return (c.side === 'CALL' ? Math.max(0, settlement - c.strike) : Math.max(0, c.strike - settlement)) * c.unit;
}
