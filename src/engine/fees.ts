import { FEES } from './config';
import type { Venue } from './types';

/** Taker trade fee: rate × index notional, capped at a fraction of premium. */
export function tradeFee(venue: Venue, index: number, qty: number, price: number, maker = false): number {
  const f = FEES[venue];
  const notionalFee = (maker ? f.maker : f.taker) * index * Math.abs(qty);
  return Math.min(notionalFee, f.cap * price * Math.abs(qty));
}

/** Exercise / delivery fee applied to ITM legs at expiry. */
export function exerciseFee(venue: Venue, index: number, qty: number, intrinsicValue: number): number {
  if (intrinsicValue <= 0) return 0;
  const f = FEES[venue];
  return Math.min(f.exercise * index * Math.abs(qty), f.exerciseCap * intrinsicValue * Math.abs(qty));
}

export function liquidationFee(index: number, qty: number): number {
  return FEES.liquidation * index * Math.abs(qty);
}
