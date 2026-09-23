/**
 * Bot configuration. Every value can be overridden with an environment variable (see .env.example).
 * Defaults are deliberately conservative: a fixed portfolio, buy-only (as on a regular Binance account), hard risk limits.
 */
const num = (k: string, d: number) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);
const str = (k: string, d: string) => process.env[k] || d;

export const CONFIG = {
  /** fixed portfolio in USDT — never topped up; a wiped portfolio stays wiped */
  capital: num('BOT_CAPITAL', 2500),
  /** 'paper' fills against the real Binance order book; 'live' sends real orders (needs keys + LIVE_CONFIRM) */
  mode: str('BOT_MODE', 'paper') as 'paper' | 'live',
  liveConfirm: str('LIVE_CONFIRM', ''),
  apiKey: str('BINANCE_API_KEY', ''),
  apiSecret: str('BINANCE_API_SECRET', ''),
  eapiBase: str('BINANCE_EAPI_BASE', 'https://eapi.binance.com'),
  spotBase: str('BINANCE_SPOT_BASE', 'https://api.binance.com'),
  liqStream: str('BINANCE_LIQ_STREAM', 'wss://fstream.binance.com/ws/!forceOrder@arr'),
  underlyings: str('BOT_UNDERLYINGS', 'BTCUSDT,ETHUSDT,SOLUSDT').split(',').map((s) => s.trim()).filter(Boolean),

  /** market data refresh and decision cadence */
  pollMs: num('BOT_POLL_MS', 15000),
  decisionMs: num('BOT_DECISION_MS', 60000),

  risk: {
    /** max premium paid per new position, fraction of equity */
    perTrade: num('RISK_PER_TRADE', 0.05),
    /** max total premium in open positions (at cost), fraction of equity */
    maxOpenPremium: num('RISK_MAX_OPEN', 0.35),
    maxPositions: num('RISK_MAX_POSITIONS', 5),
    maxPerUnderlying: num('RISK_MAX_PER_UNDERLYING', 2),
    /** stop opening new positions for the rest of the UTC day after this loss from the day's start */
    dailyLossLimit: num('RISK_DAILY_LOSS', 0.08),
    /** halt all new trading (manual resume) after this drawdown from peak equity */
    maxDrawdown: num('RISK_MAX_DD', 0.3),
    /** entry liquidity filters */
    maxSpreadPct: num('RISK_MAX_SPREAD', 0.1),
    minHoursToExpiry: num('RISK_MIN_HOURS', 30),
    /** IOC limit protection: max price beyond best quote */
    maxSlippage: num('RISK_MAX_SLIPPAGE', 0.03),
  },

  exits: {
    takeProfit: num('EXIT_TP', 0.6),
    stopLoss: num('EXIT_SL', 0.45),
    /** trailing: once up this much, exit if it gives back to trailFloor */
    trailArm: num('EXIT_TRAIL_ARM', 0.4),
    trailFloor: num('EXIT_TRAIL_FLOOR', 0.15),
    /** close before expiry unless option is worth holding to settlement */
    closeHoursBeforeExpiry: num('EXIT_HOURS_BEFORE_EXPIRY', 10),
    maxHoldHours: num('EXIT_MAX_HOLD_HOURS', 96),
  },

  fees: {
    /** fallback when exchangeInfo lacks takerFeeRate; verify your account's VIP rate */
    taker: num('FEE_TAKER', 0.0003),
    exercise: num('FEE_EXERCISE', 0.00015),
    /** fee cap as fraction of option price (Binance: 10%) */
    cap: num('FEE_CAP', 0.1),
  },

  stateFile: str('BOT_STATE_FILE', 'bot-state.json'),
  journalFile: str('BOT_JOURNAL_FILE', 'bot-trades.csv'),
  port: num('BOT_PORT', 8787),
  host: str('BOT_HOST', '127.0.0.1'),
};

export type BotConfig = typeof CONFIG;
