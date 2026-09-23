import type { Asset, Regime, StrategyKind } from './types';

export const START_CAPITAL = 2500;
/** real-time interval between UI frames */
export const FRAME_MS = 500;
/** simulated minutes advanced per engine step */
export const SIM_MINUTES_PER_STEP = 2;
export const STEP_YEARS = SIM_MINUTES_PER_STEP / (365 * 24 * 60);
export const STEPS_PER_HOUR = 60 / SIM_MINUTES_PER_STEP;
export const RISK_FREE = 0.04;
export const SPEEDS = [1, 4, 12, 30] as const;

export interface AssetConfig {
  spot: number;
  baseVol: number;
  minQty: number;
  strikeStep: number;
  strikesEachSide: number;
  tick: number;
  /** USD of forced liquidations required to move price 1% */
  liqDepthPer1Pct: number;
  clusterScale: number; // median cluster notional USD
  beta: number; // vs BTC for scenario shocks
  venues: ('BINANCE' | 'DERIBIT')[];
  decimals: number;
}

export const ASSETS: Record<Asset, AssetConfig> = {
  BTC: { spot: 67842, baseVol: 0.55, minQty: 0.01, strikeStep: 1000, strikesEachSide: 9, tick: 5, liqDepthPer1Pct: 160e6, clusterScale: 28e6, beta: 1, venues: ['BINANCE', 'DERIBIT'], decimals: 0 },
  ETH: { spot: 2650, baseVol: 0.68, minQty: 0.1, strikeStep: 50, strikesEachSide: 9, tick: 0.1, liqDepthPer1Pct: 70e6, clusterScale: 12e6, beta: 1.2, venues: ['BINANCE', 'DERIBIT'], decimals: 1 },
  SOL: { spot: 148, baseVol: 0.85, minQty: 1, strikeStep: 4, strikesEachSide: 9, tick: 0.01, liqDepthPer1Pct: 18e6, clusterScale: 3.5e6, beta: 1.5, venues: ['BINANCE'], decimals: 2 },
};

export const ASSET_LIST: Asset[] = ['BTC', 'ETH', 'SOL'];

/** Hidden market regime dynamics (per step transition probabilities + return params, annualised). */
export const REGIME_PARAMS: Record<Regime, { drift: number; volMult: number; jumpPerYear: number; jumpMean: number; jumpVol: number; ivMult: number; skew: number }> = {
  BULL: { drift: 2.5, volMult: 0.8, jumpPerYear: 18, jumpMean: 0.004, jumpVol: 0.018, ivMult: 0.9, skew: 0.15 },
  NEUTRAL: { drift: 0.0, volMult: 0.6, jumpPerYear: 10, jumpMean: 0.0, jumpVol: 0.012, ivMult: 0.8, skew: -0.35 },
  BEAR: { drift: -3, volMult: 1.0, jumpPerYear: 26, jumpMean: -0.006, jumpVol: 0.022, ivMult: 1.12, skew: -0.9 },
  EXTREME: { drift: -2, volMult: 1.7, jumpPerYear: 90, jumpMean: -0.008, jumpVol: 0.035, ivMult: 1.75, skew: -1.4 },
};

/** Expected regime duration in sim hours. */
export const REGIME_HOURS: Record<Regime, number> = { BULL: 14, NEUTRAL: 20, BEAR: 12, EXTREME: 3 };
export const REGIME_NEXT: Record<Regime, [Regime, number][]> = {
  BULL: [['NEUTRAL', 0.55], ['BEAR', 0.25], ['EXTREME', 0.2]],
  NEUTRAL: [['BULL', 0.42], ['BEAR', 0.42], ['EXTREME', 0.16]],
  BEAR: [['NEUTRAL', 0.45], ['BULL', 0.2], ['EXTREME', 0.35]],
  EXTREME: [['BEAR', 0.45], ['NEUTRAL', 0.3], ['BULL', 0.25]],
};

/**
 * Fee schedule (USDT-settled options).
 * Binance Options: taker 0.03% / maker 0.02% of index notional, capped at 10% of premium; exercise 0.015% capped 10% of value.
 * Deribit: 0.03% of underlying capped at 12.5% of premium; delivery 0.015% capped 12.5%.
 */
export const FEES = {
  BINANCE: { taker: 0.0003, maker: 0.0002, cap: 0.1, exercise: 0.00015, exerciseCap: 0.1 },
  DERIBIT: { taker: 0.0003, maker: 0.0003, cap: 0.125, exercise: 0.00015, exerciseCap: 0.125 },
  /** liquidation clearance fee on index notional of force-closed legs */
  liquidation: 0.0035,
};

export interface StrategyRule {
  label: string;
  tp: number; // fraction of riskCapital
  sl: number; // fraction of riskCapital
  maxHoldHours: number;
  credit: boolean;
}

export const STRATEGY_RULES: Record<StrategyKind, StrategyRule> = {
  IRON_CONDOR: { label: 'IC', tp: 0.22, sl: 0.55, maxHoldHours: 60, credit: true },
  SHORT_STRANGLE: { label: 'SS', tp: 0.18, sl: 0.4, maxHoldHours: 30, credit: true },
  CALENDAR: { label: 'CAL', tp: 0.3, sl: 0.35, maxHoldHours: 48, credit: false },
  RISK_REVERSAL: { label: 'RR', tp: 0.35, sl: 0.4, maxHoldHours: 40, credit: true },
  DIRECTIONAL: { label: 'DIR', tp: 1.0, sl: 0.5, maxHoldHours: 36, credit: false },
  LONG_STRADDLE: { label: 'STR', tp: 0.6, sl: 0.4, maxHoldHours: 20, credit: false },
};

export const STRATEGY_COLORS: Record<StrategyKind, string> = {
  IRON_CONDOR: '#2ee6b6',
  SHORT_STRANGLE: '#f5a524',
  CALENDAR: '#3b82f6',
  RISK_REVERSAL: '#a855f7',
  DIRECTIONAL: '#ff4d5e',
  LONG_STRADDLE: '#22d3ee',
};

export const STRATEGY_NAMES: Record<StrategyKind, string> = {
  IRON_CONDOR: 'איירון קונדור',
  SHORT_STRANGLE: 'שורט סטרנגל',
  CALENDAR: 'קלנדר',
  RISK_REVERSAL: 'ריסק ריברסל',
  DIRECTIONAL: 'כיווני',
  LONG_STRADDLE: 'לונג סטראדל',
};

/** Aggression knobs. */
export const RISK = {
  maxStrategies: 7,
  maxPerAsset: 3,
  /** max initial margin (or debit) committed to one new strategy as fraction of equity */
  perTradeBudget: 0.10,
  /** cap on total IM / equity when opening new risk */
  maxMarginUtil: 0.60,
  /** maintenance margin as fraction of initial margin */
  mmRatio: 0.85,
  /** circuit breaker: intraday drawdown fraction from day-high equity */
  circuitDd: 0.05,
  circuitHours: 3,
  entryCooldownSteps: 6,
  blowupThreshold: 0.1,

};

