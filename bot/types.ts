export type BotStrategy = 'LONG_STRADDLE' | 'LONG_CALL' | 'LONG_PUT';

export interface PositionLeg {
  symbol: string;
  qty: number;
  entryPrice: number;
  entryFee: number;
}

export interface Position {
  id: string;
  strategy: BotStrategy;
  underlying: string;
  legs: PositionLeg[];
  openedAt: number;
  /** premium + fees paid */
  cost: number;
  /** cash received from sells and settlements, net of fees */
  proceeds?: number;
  note: string;
  bestPnlPct: number;
  /** legs past expiry waiting for Binance's settlement price */
  awaitingSettlement?: boolean;
}

export interface FillRecord {
  time: number;
  mode: 'paper' | 'live';
  positionId: string;
  strategy: BotStrategy;
  symbol: string;
  side: 'BUY' | 'SELL' | 'SETTLE';
  qty: number;
  price: number;
  fee: number;
  touch: number;
  slippageBp: number;
  reason: string;
  orderId?: string;
}

export interface ClosedTrade {
  id: string;
  strategy: BotStrategy;
  underlying: string;
  openedAt: number;
  closedAt: number;
  cost: number;
  proceeds: number;
  fees: number;
  pnl: number;
  pnlPct: number;
  exitReason: string;
  note: string;
}

export interface BotState {
  v: 1;
  startedAt: number;
  capital: number;
  cash: number;
  positions: Position[];
  closed: ClosedTrade[];
  fills: FillRecord[];
  equity: { t: number; equity: number }[];
  peakEquity: number;
  dayStart: { day: number; equity: number };
  feesPaid: number;
  halted: boolean;
  haltReason: string;
  entriesPausedUntil: number;
  signals: Signal[];
  events: { time: number; level: 'info' | 'warn' | 'error'; text: string }[];
}

export interface Signal {
  time: number;
  underlying: string;
  strategy: BotStrategy;
  score: number;
  reason: string;
  action: 'entered' | 'skipped';
  skipReason?: string;
}
