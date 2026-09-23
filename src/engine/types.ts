import type { OptionType } from '../lib/blackScholes';

export type { OptionType };
export type Asset = 'BTC' | 'ETH' | 'SOL';
export type Venue = 'BINANCE' | 'DERIBIT';
export type Regime = 'BULL' | 'NEUTRAL' | 'BEAR' | 'EXTREME';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type StrategyKind =
  | 'IRON_CONDOR'
  | 'SHORT_STRANGLE'
  | 'CALENDAR'
  | 'RISK_REVERSAL'
  | 'DIRECTIONAL'
  | 'LONG_STRADDLE';

export interface OptionKey {
  asset: Asset;
  expiry: number; // UTC ms
  strike: number;
  type: OptionType;
}

export interface Quote extends OptionKey {
  symbol: string;
  bid: number;
  ask: number;
  mark: number;
  iv: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  oi: number;
  volume: number;
  /** top-of-book size in contracts (base asset units) */
  bidSize: number;
  askSize: number;
}

export interface Leg extends OptionKey {
  id: string;
  /** signed quantity in base-asset units; > 0 long, < 0 short */
  qty: number;
  entryPrice: number;
  venue: Venue;
}

export interface Strategy {
  id: string;
  kind: StrategyKind;
  asset: Asset;
  label: string;
  tag: string;
  legs: Leg[];
  openedAt: number;
  /** net cash flow from all trades incl. fees (credit > 0) */
  cashFlow: number;
  fees: number;
  /** capital the strategy was sized against (debit paid or initial margin) */
  riskCapital: number;
  entryRegime: Regime;
  entryNote: string;
  units: number;
  dayPnlAnchor: number;
}

export interface LiquidationCluster {
  price: number;
  notional: number; // USD
  side: 'LONG' | 'SHORT'; // LONG = long positions get liquidated below price
  leverage: number;
}

export interface MarketLiqEvent {
  time: number;
  asset: Asset;
  side: 'LONG' | 'SHORT';
  notional: number;
  price: number;
  impactPct: number;
}

export interface AccountLiqEvent {
  time: number;
  strategy: string;
  lossUsd: number;
  feeUsd: number;
  equityAfter: number;
  reason: string;
}

export interface AssetMarket {
  asset: Asset;
  spot: number;
  prevDayClose: number;
  atmIv: number;
  longIv: number;
  skew: number;
  smile: number;
  realizedVol: number;
  funding: number; // 8h funding rate
  perpOi: number; // USD
  history: number[]; // spot history (per step)
  ivHistory: number[]; // atm iv history (per sim hour)
  clusters: LiquidationCluster[];
  liq1hLong: number;
  liq1hShort: number;
  liqWindow: { time: number; side: 'LONG' | 'SHORT'; notional: number }[];
  lastReturn: number;
}

export interface Fill {
  time: number;
  strategyId: string;
  strategyTag: string;
  strategyLabel: string;
  side: 'B' | 'S';
  instrument: string;
  asset: Asset;
  expiry: number;
  strike: number;
  type: OptionType;
  qty: number;
  price: number;
  touch: number;
  venue: Venue;
  fee: number;
  slippageBp: number;
  latencyMs: number;
  pnl: number | null;
  action: 'OPEN' | 'CLOSE' | 'EXPIRY' | 'LIQ';
}

export interface Alert {
  id: number;
  time: number;
  text: string;
  severity: Severity;
}

export interface RegimeProbs {
  BULL: number;
  NEUTRAL: number;
  BEAR: number;
  EXTREME: number;
}

export interface ExecStats {
  attempts: number;
  fills: number;
  rejects: number;
  slippageBpSum: number;
  latencySum: number;
  feeSum: number;
  latencyLast: number;
}

export interface EquityPoint {
  t: number;
  equity: number;
  dd: number;
}
