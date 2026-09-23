import type { DeskEngine } from '../engine/engine';
import type { Asset } from '../engine/types';
import type { MarketDataFeed } from './types';

/** Read-only Binance European Options public REST feed (no keys). Used to anchor the simulator to live prices. */
export class BinancePublicFeed implements MarketDataFeed {
  readonly name = 'binance-eapi-public';
  private base = 'https://eapi.binance.com';

  async connect(): Promise<void> {}
  disconnect(): void {}

  async indexPrice(asset: Asset): Promise<number> {
    const r = await fetch(`${this.base}/eapi/v1/index?underlying=${asset}USDT`);
    if (!r.ok) throw new Error(`index ${r.status}`);
    const j = (await r.json()) as { indexPrice: string };
    return Number(j.indexPrice);
  }

  async optionMarks(asset: Asset) {
    const r = await fetch(`${this.base}/eapi/v1/mark`);
    if (!r.ok) throw new Error(`mark ${r.status}`);
    const j = (await r.json()) as { symbol: string; markPrice: string; markIV: string; delta: string; gamma: string; vega: string; theta: string }[];
    return j
      .filter((x) => x.symbol.startsWith(`${asset}-`))
      .map((x) => ({ symbol: x.symbol, markPrice: +x.markPrice, markIV: +x.markIV, delta: +x.delta, gamma: +x.gamma, vega: +x.vega, theta: +x.theta }));
  }
}

/** Rescale the simulated market to live index prices (best-effort; silently keeps sim prices on failure/CORS). */
export async function anchorToLiveIndex(engine: DeskEngine, feed: MarketDataFeed = new BinancePublicFeed()): Promise<void> {
  for (const a of ['BTC', 'ETH', 'SOL'] as const) {
    try {
      const px = await feed.indexPrice(a);
      if (px > 0 && Number.isFinite(px)) engine.market.rebase(a, px);
    } catch {
      /* offline or blocked: keep simulated anchor */
    }
  }
}
