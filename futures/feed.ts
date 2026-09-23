/** Market data for the desk: Binance USDⓈ-M futures public endpoints (no keys needed). */
export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number; closeT: number }
export interface Quote { symbol: string; mark: number; index: number; bid: number; ask: number; funding: number; nextFunding: number; t: number }
export interface Book { bids: [number, number][]; asks: [number, number][] }
export interface SymbolInfo { symbol: string; step: number; tick: number; minQty: number; minNotional: number }

export interface Feed {
  now(): number;
  symbols(list: string[]): Promise<SymbolInfo[]>;
  quotes(list: string[]): Promise<Quote[]>;
  candles(symbol: string, interval: string, limit: number): Promise<Candle[]>;
  book(symbol: string): Promise<Book>;
}

export class BinanceFuturesFeed implements Feed {
  private bannedUntil = 0;
  constructor(private base: string) {}
  now() { return Date.now(); }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    if (Date.now() < this.bannedUntil) throw new Error(`rate-limited by Binance until ${new Date(this.bannedUntil).toISOString()}`);
    const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const res = await fetch(`${this.base}${path}${q.size ? `?${q}` : ''}`, { signal: AbortSignal.timeout(10000) });
    if (res.status === 429 || res.status === 418) {
      this.bannedUntil = Date.now() + Number(res.headers.get('retry-after') ?? 60) * 1000;
      throw new Error(`Binance ${res.status}: backing off`);
    }
    if (!res.ok) throw new Error(`Binance ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  async symbols(list: string[]) {
    const info = await this.get<{ symbols: { symbol: string; status: string; contractType: string; filters: { filterType: string; tickSize?: string; stepSize?: string; minQty?: string; notional?: string }[] }[] }>('/fapi/v1/exchangeInfo');
    return info.symbols.filter((s) => list.includes(s.symbol) && s.contractType === 'PERPETUAL' && s.status === 'TRADING').map((s) => {
      const f = (t: string) => s.filters.find((x) => x.filterType === t);
      return { symbol: s.symbol, tick: Number(f('PRICE_FILTER')?.tickSize ?? 0.01), step: Number(f('LOT_SIZE')?.stepSize ?? 0.001), minQty: Number(f('LOT_SIZE')?.minQty ?? 0.001), minNotional: Number(f('MIN_NOTIONAL')?.notional ?? 5) };
    });
  }

  async quotes(list: string[]) {
    const [prem, book] = await Promise.all([
      this.get<{ symbol: string; markPrice: string; indexPrice: string; lastFundingRate: string; nextFundingTime: number; time: number }[]>('/fapi/v1/premiumIndex'),
      this.get<{ symbol: string; bidPrice: string; askPrice: string }[]>('/fapi/v1/ticker/bookTicker'),
    ]);
    const bt = new Map(book.map((b) => [b.symbol, b]));
    return prem.filter((p) => list.includes(p.symbol)).map((p) => ({
      symbol: p.symbol, mark: Number(p.markPrice), index: Number(p.indexPrice), funding: Number(p.lastFundingRate), nextFunding: p.nextFundingTime, t: p.time,
      bid: Number(bt.get(p.symbol)?.bidPrice ?? p.markPrice), ask: Number(bt.get(p.symbol)?.askPrice ?? p.markPrice),
    }));
  }

  async candles(symbol: string, interval: string, limit: number) {
    const rows = await this.get<(string | number)[][]>('/fapi/v1/klines', { symbol, interval, limit });
    return rows.map((r) => ({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]), closeT: Number(r[6]) }));
  }

  async book(symbol: string) {
    const d = await this.get<{ bids: [string, string][]; asks: [string, string][] }>('/fapi/v1/depth', { symbol, limit: 50 });
    return { bids: d.bids.map(([p, q]) => [Number(p), Number(q)] as [number, number]), asks: d.asks.map(([p, q]) => [Number(p), Number(q)] as [number, number]) };
  }
}
