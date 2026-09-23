/**
 * Futures desk configuration. Every value can be overridden with an environment variable (see .env.example, FUT_*).
 * Defaults are conservative: fixed capital, 1% risk per trade, isolated margin, low leverage, hard loss limits.
 */
const num = (k: string, d: number) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);
const str = (k: string, d: string) => process.env[k] || d;

export const FCONFIG = {
  /** fixed portfolio in USDT — never topped up */
  capital: num('FUT_CAPITAL', 2500),
  mode: 'paper' as 'paper' | 'demo',
  base: str('FUT_BASE', 'https://fapi.binance.com'),
  symbols: str('FUT_SYMBOLS', 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),

  /** cadence: quotes/marks (and stop checks) and candle refresh */
  fastMs: num('FUT_FAST_MS', 10000),
  candleMs: num('FUT_CANDLE_MS', 60000),

  strategy: {
    /** entry timeframe and trend timeframe (Binance kline intervals) */
    tf: str('FUT_TF', '15m'),
    trendTf: str('FUT_TREND_TF', '1h'),
    breakoutLookback: num('FUT_BREAKOUT', 20),
    atrStop: num('FUT_ATR_STOP', 2),
    /** take profit at this multiple of the initial risk (R) */
    targetR: num('FUT_TARGET_R', 2),
    /** skip entries when volatility (ATR/price) is outside this band */
    minAtrPct: num('FUT_MIN_ATR', 0.0015),
    maxAtrPct: num('FUT_MAX_ATR', 0.03),
    /** do not go long when funding is above this (per interval), nor short below its negative */
    maxFunding: num('FUT_MAX_FUNDING', 0.0005),
  },

  risk: {
    /** equity risked per trade (distance to stop × size) */
    perTrade: num('FUT_RISK_PER_TRADE', 0.01),
    maxLeverage: num('FUT_MAX_LEV', 5),
    /** max isolated margin locked in one position, fraction of equity */
    maxMarginPerPos: num('FUT_MAX_MARGIN', 0.25),
    maxPositions: num('FUT_MAX_POSITIONS', 3),
    /** no new entries for the rest of the UTC day after this loss */
    dailyLoss: num('FUT_DAILY_LOSS', 0.04),
    /** halt all new entries (manual resume) after this drawdown from peak */
    maxDrawdown: num('FUT_MAX_DD', 0.2),
    /** market order protection: max average fill beyond the best quote */
    maxSlippage: num('FUT_MAX_SLIPPAGE', 0.002),
    /** maintenance margin rate used for the liquidation price (first-tier Binance values) */
    mmr: num('FUT_MMR', 0.005),
    mmrBtc: num('FUT_MMR_BTC', 0.004),
  },

  exits: {
    /** move the stop to breakeven after this many R in profit, then trail 1R behind */
    breakevenR: num('FUT_BE_R', 1),
    maxHoldHours: num('FUT_MAX_HOLD_H', 48),
  },

  /** USDⓈ-M regular tier: maker 0.02%, taker 0.05% — check your account's VIP level */
  fees: { taker: num('FUT_FEE_TAKER', 0.0005), maker: num('FUT_FEE_MAKER', 0.0002) },

  stateFile: str('FUT_STATE_FILE', 'futures-state.json'),
  journalFile: str('FUT_JOURNAL_FILE', 'futures-trades.csv'),
  reportDir: str('FUT_REPORT_DIR', 'futures-reports'),
  port: num('FUT_PORT', 8788),
  host: str('FUT_HOST', '127.0.0.1'),
};
export type FConfig = typeof FCONFIG;
