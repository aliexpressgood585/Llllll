import type { SurfaceState } from './market';
import type { Asset, AssetMarket, MarketLiqEvent, OptionKey, OptionType, Quote, Regime, Venue } from './types';

export interface InstrumentSpec {
  /** minimum order size in base-asset units */
  minQty: number;
  /** option price tick in USD */
  tick: number;
  venues: Venue[];
}

/**
 * Everything the desk engine needs from a market. Implemented by the synthetic MarketSim
 * and by LiveMarket (Deribit options + Binance liquidation stream).
 */
export interface MarketSource {
  readonly kind: 'sim' | 'live';
  /** true only in simulation, where the true regime is known and model accuracy can be scored */
  readonly regimeObservable: boolean;
  regime: Regime;
  assets: Record<Asset, AssetMarket>;
  liqEvents: MarketLiqEvent[];
  step(now: number): { events: MarketLiqEvent[]; regimeChanged: boolean };
  onHour(): void;
  onDay(): void;
  surface(a: Asset): SurfaceState;
  expiries(now: number): number[];
  strikes(a: Asset, expiry: number, now: number): number[];
  quote(k: OptionKey, now: number): Quote;
  strikeForDelta(a: Asset, expiry: number, type: OptionType, targetDelta: number, now: number): number;
  spec(a: Asset): InstrumentSpec;
  /** live connection health (live markets only) */
  status?(): import('./engine').DataSourceStatus;
}
