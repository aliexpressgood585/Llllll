import { createHmac } from 'node:crypto';

/** Response shapes per the Binance European Options API (field names as published; numbers arrive as strings). */
export interface OptionSymbol {
  symbol: string;
  underlying: string;
  expiryDate: number;
  strikePrice: string;
  side: 'CALL' | 'PUT';
  unit: number;
  minQty: string;
  maxQty: string;
  makerFeeRate?: string;
  takerFeeRate?: string;
  priceScale: number;
  quantityScale: number;
  quoteAsset?: string;
  status?: string;
  filters: { filterType: string; tickSize?: string; minPrice?: string; maxPrice?: string; stepSize?: string; minQty?: string; maxQty?: string }[];
}
export interface ExchangeInfo {
  serverTime: number;
  optionSymbols: OptionSymbol[];
  rateLimits?: { rateLimitType: string; interval: string; intervalNum: number; limit: number }[];
}
export interface MarkRow {
  symbol: string;
  markPrice: string;
  bidIV: string;
  askIV: string;
  markIV: string;
  delta: string;
  theta: string;
  gamma: string;
  vega: string;
  highPriceLimit: string;
  lowPriceLimit: string;
}
export interface TickerRow {
  symbol: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  volume: string;
  amount: string;
  exercisePrice: string;
}
export interface DepthResp {
  T: number;
  u: number;
  bids: [string, string][];
  asks: [string, string][];
}
export interface ExerciseRow {
  symbol: string;
  strikePrice: string;
  realStrikePrice: string;
  expiryDate: number;
  strikeResult: string;
}
export interface OrderResp {
  orderId: number;
  symbol: string;
  price: string;
  quantity: string;
  executedQty: string;
  fee: string;
  side: 'BUY' | 'SELL';
  status: string;
  avgPrice: string;
  clientOrderId: string;
}

export class BinanceHttpError extends Error {
  constructor(public status: number, public code: number | undefined, msg: string) {
    super(msg);
  }
}

/** Minimal Binance Options REST client: public market data + HMAC-signed account/order endpoints. */
export class BinanceClient {
  private timeOffset = 0;
  private bannedUntil = 0;
  weightUsed = 0;

  constructor(private eapi: string, private spot: string, private apiKey = '', private apiSecret = '') {}

  private async request<T>(base: string, method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string | number | boolean | undefined> = {}, signed = false): Promise<T> {
    if (Date.now() < this.bannedUntil) throw new Error(`rate-limited until ${new Date(this.bannedUntil).toISOString()}`);
    const clean = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string | number | boolean][];
    const qs = new URLSearchParams(clean.map(([k, v]) => [k, String(v)]));
    let body: string | undefined;
    let query = method === 'GET' || method === 'DELETE' ? qs.toString() : '';
    if (method === 'POST') body = qs.toString();
    const headers: Record<string, string> = {};
    if (signed) {
      if (!this.apiKey || !this.apiSecret) throw new Error('signed endpoint requires BINANCE_API_KEY / BINANCE_API_SECRET');
      const ts = `timestamp=${Date.now() + this.timeOffset}&recvWindow=5000`;
      query = query ? `${query}&${ts}` : ts;
      const sig = createHmac('sha256', this.apiSecret).update(`${query}${body ?? ''}`).digest('hex');
      query += `&signature=${sig}`;
      headers['X-MBX-APIKEY'] = this.apiKey;
    }
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const url = `${base}${path}${query ? `?${query}` : ''}`;
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(10000) });
    const w = res.headers.get('x-mbx-used-weight-1m');
    if (w) this.weightUsed = Number(w);
    const text = await res.text();
    if (res.status === 429 || res.status === 418) {
      const retry = Number(res.headers.get('retry-after') ?? 60);
      this.bannedUntil = Date.now() + retry * 1000;
      throw new BinanceHttpError(res.status, undefined, `Binance rate limit (${res.status}), backing off ${retry}s`);
    }
    if (!res.ok) {
      let code: number | undefined;
      let msg = text.slice(0, 200);
      try {
        const j = JSON.parse(text) as { code?: number; msg?: string };
        code = j.code;
        msg = j.msg ?? msg;
      } catch {
        /* not json */
      }
      throw new BinanceHttpError(res.status, code, `Binance ${res.status}${code ? ` ${code}` : ''}: ${msg}`);
    }
    return JSON.parse(text) as T;
  }

  // ---- public options market data
  exchangeInfo = () => this.request<ExchangeInfo>(this.eapi, 'GET', '/eapi/v1/exchangeInfo');
  index = (underlying: string) => this.request<{ time: number; indexPrice: string }>(this.eapi, 'GET', '/eapi/v1/index', { underlying });
  mark = () => this.request<MarkRow[]>(this.eapi, 'GET', '/eapi/v1/mark');
  ticker = () => this.request<TickerRow[]>(this.eapi, 'GET', '/eapi/v1/ticker');
  depth = (symbol: string, limit = 20) => this.request<DepthResp>(this.eapi, 'GET', '/eapi/v1/depth', { symbol, limit });
  exerciseHistory = (underlying: string, startTime?: number) => this.request<ExerciseRow[]>(this.eapi, 'GET', '/eapi/v1/exerciseHistory', { underlying, startTime, limit: 100 });
  time = () => this.request<{ serverTime: number }>(this.eapi, 'GET', '/eapi/v1/time');
  // ---- spot klines for realised vol / momentum of the underlying
  klines = (symbol: string, interval: string, limit: number) => this.request<(string | number)[][]>(this.spot, 'GET', '/api/v3/klines', { symbol, interval, limit });

  async syncTime(): Promise<void> {
    const t0 = Date.now();
    const { serverTime } = await this.time();
    this.timeOffset = serverTime - Math.round((t0 + Date.now()) / 2);
  }

  // ---- signed (live mode only)
  account = () => this.request<{ asset: { asset: string; marginBalance: string; equity: string; available: string }[] }>(this.eapi, 'GET', '/eapi/v1/account', {}, true);
  placeOrder = (p: { symbol: string; side: 'BUY' | 'SELL'; quantity: string; price: string; clientOrderId: string; reduceOnly?: boolean }) =>
    this.request<OrderResp>(this.eapi, 'POST', '/eapi/v1/order', { symbol: p.symbol, side: p.side, type: 'LIMIT', quantity: p.quantity, price: p.price, timeInForce: 'IOC', reduceOnly: p.reduceOnly, newOrderRespType: 'RESULT', clientOrderId: p.clientOrderId }, true);
  queryOrder = (symbol: string, clientOrderId: string) => this.request<OrderResp>(this.eapi, 'GET', '/eapi/v1/order', { symbol, clientOrderId }, true);
}
