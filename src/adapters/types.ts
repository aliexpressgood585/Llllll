import type { Asset, OptionKey, Venue } from '../engine/types';

/**
 * Contracts a live integration must satisfy to replace the simulator.
 * The engine only talks to MarketSim / ExecutionVenue; a live build swaps in implementations of these.
 */
export interface MarketDataFeed {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): void;
  indexPrice(asset: Asset): Promise<number>;
  /** mark price + greeks for listed option symbols */
  optionMarks(asset: Asset): Promise<{ symbol: string; markPrice: number; markIV: number; delta: number; gamma: number; vega: number; theta: number }[]>;
}

export interface LiveOrderRequest extends OptionKey {
  side: 'BUY' | 'SELL';
  qty: number;
  orderType: 'LIMIT' | 'MARKET';
  price?: number;
  reduceOnly?: boolean;
  clientOrderId: string;
}

export interface LiveExecutionVenue {
  readonly venue: Venue;
  placeOrder(req: LiveOrderRequest): Promise<{ orderId: string; status: 'ACCEPTED' | 'FILLED' | 'REJECTED'; avgPrice?: number; fee?: number }>;
  cancelOrder(orderId: string): Promise<void>;
}
