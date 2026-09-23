import type { BinanceClient, DepthResp, OptionSymbol } from './binanceClient';

export interface Contract {
  symbol: string;
  underlying: string;
  expiry: number;
  strike: number;
  side: 'CALL' | 'PUT';
  unit: number;
  minQty: number;
  maxQty: number;
  step: number;
  tick: number;
  takerFee: number | null;
}

export interface OptQuote {
  bid: number;
  ask: number;
  last: number;
  mark: number;
  markIV: number;
  bidIV: number;
  askIV: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  volume: number;
}

export interface Liq {
  time: number;
  underlying: string;
  side: 'LONG' | 'SHORT';
  notional: number;
}

const n = (v: string | number | undefined | null) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function parseContract(s: OptionSymbol): Contract {
  const lot = s.filters.find((f) => f.filterType === 'LOT_SIZE');
  const pf = s.filters.find((f) => f.filterType === 'PRICE_FILTER');
  return {
    symbol: s.symbol,
    underlying: s.underlying,
    expiry: s.expiryDate,
    strike: n(s.strikePrice),
    side: s.side,
    unit: s.unit || 1,
    minQty: n(lot?.minQty ?? s.minQty),
    maxQty: n(lot?.maxQty ?? s.maxQty),
    step: n(lot?.stepSize) || 10 ** -(s.quantityScale ?? 2),
    tick: n(pf?.tickSize) || 10 ** -(s.priceScale ?? 1),
    takerFee: s.takerFeeRate !== undefined ? n(s.takerFeeRate) : null,
  };
}

/** Round to a step without floating-point dust (down for quantities). */
export const floorTo = (v: number, step: number) => Math.floor(v / step + 1e-9) * step;
export const roundTo = (v: number, step: number, up: boolean) => (up ? Math.ceil(v / step - 1e-9) : Math.floor(v / step + 1e-9)) * step;
export const fmtStep = (v: number, step: number) => v.toFixed(Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));

/**
 * Binance options market state: contracts from exchangeInfo, quotes from /ticker + /mark (Binance's own greeks/IV),
 * index from /index, 1m spot closes for realised vol/momentum, official settlement prices from /exerciseHistory,
 * and the USDⓈ-M liquidation stream.
 */
export class OptionsMarket {
  contracts = new Map<string, Contract>();
  quotes = new Map<string, OptQuote>();
  index: Record<string, { price: number; time: number; dayOpen: number }> = {};
  closes: Record<string, { t: number; c: number }[]> = {};
  settlements = new Map<string, number>();
  liqs: Liq[] = [];
  lastQuotes = 0;
  lastInfo = 0;
  errors: { time: number; msg: string }[] = [];

  constructor(readonly api: BinanceClient, public underlyings: string[]) {}

  noteError(msg: string) {
    this.errors.unshift({ time: Date.now(), msg });
    if (this.errors.length > 30) this.errors.length = 30;
  }

  async loadInfo(): Promise<void> {
    const info = await this.api.exchangeInfo();
    const map = new Map<string, Contract>();
    for (const s of info.optionSymbols ?? []) {
      if (!this.underlyings.includes(s.underlying)) continue;
      if (s.status && s.status !== 'TRADING') continue;
      map.set(s.symbol, parseContract(s));
    }
    if (!map.size) throw new Error('exchangeInfo returned no tradable contracts for ' + this.underlyings.join(','));
    // expired contracts drop out of exchangeInfo; keep them for a week so held positions can still be valued and settled
    const keepSince = Date.now() - 7 * 86400e3;
    for (const [sym, c] of this.contracts) if (!map.has(sym) && c.expiry >= keepSince) map.set(sym, c);
    this.contracts = map;
    this.underlyings = this.underlyings.filter((u) => [...map.values()].some((c) => c.underlying === u));
    this.lastInfo = Date.now();
  }

  async refreshQuotes(): Promise<void> {
    const [marks, tickers] = await Promise.all([this.api.mark(), this.api.ticker(), ...this.underlyings.map((u) => this.refreshIndex(u))]);
    const q = new Map<string, OptQuote>();
    const tk = new Map(tickers.map((t) => [t.symbol, t]));
    for (const m of marks) {
      if (!this.contracts.has(m.symbol)) continue;
      const t = tk.get(m.symbol);
      q.set(m.symbol, {
        bid: n(t?.bidPrice),
        ask: n(t?.askPrice),
        last: n(t?.lastPrice),
        mark: n(m.markPrice),
        markIV: n(m.markIV),
        bidIV: n(m.bidIV),
        askIV: n(m.askIV),
        delta: n(m.delta),
        gamma: n(m.gamma),
        vega: n(m.vega),
        theta: n(m.theta),
        volume: n(t?.volume),
      });
    }
    if (q.size) {
      this.quotes = q;
      this.lastQuotes = Date.now();
    }
  }

  private async refreshIndex(u: string) {
    const r = await this.api.index(u);
    const prev = this.index[u];
    const price = n(r.indexPrice);
    const day = Math.floor(Date.now() / 86400000);
    const dayOpen = prev && Math.floor(prev.time / 86400000) === day ? prev.dayOpen : price;
    if (price > 0) this.index[u] = { price, time: r.time || Date.now(), dayOpen };
  }

  async refreshHistory(): Promise<void> {
    for (const u of this.underlyings) {
      const k = await this.api.klines(u, '1m', 1000);
      this.closes[u] = k.map((row) => ({ t: Number(row[0]), c: n(row[4] as string) })).filter((x) => x.c > 0);
    }
  }

  async refreshSettlements(since: number): Promise<void> {
    for (const u of this.underlyings) {
      const rows = await this.api.exerciseHistory(u, since);
      for (const r of rows) if (n(r.realStrikePrice) > 0) this.settlements.set(r.symbol, n(r.realStrikePrice));
    }
  }

  /** Fresh order-book snapshot (used for every simulated fill). */
  depth(symbol: string): Promise<DepthResp> {
    return this.api.depth(symbol, 20);
  }

  onLiquidation = (l: Liq) => {
    this.liqs.push(l);
    const cut = Date.now() - 6 * 3600e3;
    if (this.liqs.length > 5000 || this.liqs[0]?.time < cut) this.liqs = this.liqs.filter((x) => x.time >= cut);
  };

  // ---------------------------------------------------------------- analytics
  spot(u: string): number {
    return this.index[u]?.price ?? 0;
  }

  /** annualised realised vol from 1m closes over the last `minutes` */
  realizedVol(u: string, minutes: number): number {
    const c = (this.closes[u] ?? []).slice(-minutes - 1);
    if (c.length < 10) return 0;
    const r: number[] = [];
    for (let i = 1; i < c.length; i++) r.push(Math.log(c[i].c / c[i - 1].c));
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    const v = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1);
    return Math.sqrt(v * 525600);
  }

  /** return over the last `minutes`, as a z-score against 24h-scale realised vol */
  momentumZ(u: string, minutes: number): number {
    const c = this.closes[u] ?? [];
    if (c.length < minutes + 1) return 0;
    const ret = Math.log(c[c.length - 1].c / c[c.length - 1 - minutes].c);
    const vol = this.realizedVol(u, Math.min(c.length - 1, 960)) || 0.5;
    return ret / (vol * Math.sqrt(minutes / 525600));
  }

  expiries(u: string): number[] {
    const now = Date.now();
    return [...new Set([...this.contracts.values()].filter((c) => c.underlying === u && c.expiry > now).map((c) => c.expiry))].sort((a, b) => a - b);
  }

  contractsFor(u: string, expiry: number, side?: 'CALL' | 'PUT'): Contract[] {
    return [...this.contracts.values()].filter((c) => c.underlying === u && c.expiry === expiry && (!side || c.side === side)).sort((a, b) => a.strike - b.strike);
  }

  /** Binance mark IV of the ATM call at an expiry (0 if unavailable) */
  atmIv(u: string, expiry: number): number {
    const s = this.spot(u);
    const calls = this.contractsFor(u, expiry, 'CALL');
    if (!calls.length || !s) return 0;
    const atm = calls.reduce((b, c) => (Math.abs(c.strike - s) < Math.abs(b.strike - s) ? c : b), calls[0]);
    return this.quotes.get(atm.symbol)?.markIV ?? 0;
  }

  liqSum(u: string, minutes: number, side?: 'LONG' | 'SHORT'): number {
    const cut = Date.now() - minutes * 60e3;
    return this.liqs.filter((l) => l.underlying === u && l.time >= cut && (!side || l.side === side)).reduce((a, l) => a + l.notional, 0);
  }
}
