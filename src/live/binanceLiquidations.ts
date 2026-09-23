import type { Asset } from '../engine/types';

export interface LiveLiquidation {
  time: number;
  asset: Asset;
  /** LONG = a long position was force-closed (exchange SELL order) */
  side: 'LONG' | 'SHORT';
  notional: number;
  price: number;
}

const SYMBOLS: Record<string, Asset> = { BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL' };

/**
 * Binance USDⓈ-M futures public liquidation stream (all symbols).
 * Note: Binance pushes at most one liquidation snapshot per symbol per second, so totals are a lower bound.
 */
export class BinanceLiquidationStream {
  private ws: WebSocket | null = null;
  private stopped = false;
  private retry = 0;
  connected = false;

  constructor(private onLiq: (l: LiveLiquidation) => void, private url = 'wss://fstream.binance.com/ws/!forceOrder@arr') {}

  start(): void {
    if (this.stopped) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data)) as { o?: { s: string; S: 'BUY' | 'SELL'; z: string; ap: string; p: string; T: number } };
        const o = m.o;
        if (!o) return;
        const asset = SYMBOLS[o.s];
        if (!asset) return;
        const price = Number(o.ap) || Number(o.p);
        const qty = Number(o.z);
        if (!(price > 0 && qty > 0)) return;
        this.onLiq({ time: o.T || Date.now(), asset, side: o.S === 'SELL' ? 'LONG' : 'SHORT', notional: price * qty, price });
      } catch {
        /* ignore malformed frame */
      }
    };
    ws.onclose = () => {
      this.connected = false;
      if (this.stopped) return;
      const delay = Math.min(30000, 1000 * 2 ** this.retry++);
      globalThis.setTimeout(() => this.start(), delay);
    };
    ws.onerror = () => ws.close();
  }

  stop(): void {
    this.stopped = true;
    this.ws?.close();
  }
}
