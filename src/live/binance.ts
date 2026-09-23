export interface Instrument {
  symbol: string; underlying: string; expiryDate: number; strikePrice: string;
  side: string; unit: number; minQty: string; maxQty: string; quantityScale: number;
  status?: string;
  filters: { filterType: string; tickSize?: string; stepSize?: string; minQty?: string; maxQty?: string }[];
}
export interface Book { bids: [string, string][]; asks: [string, string][]; T: number }
export async function publicGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(8000);
  const r = await fetch(`https://eapi.binance.com/eapi/v1/${path}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Binance HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

/** Estimate an immediately marketable limit buy, never a real order or guaranteed fill. */
export function estimateBuy(instrument: Instrument, book: Book, qty: number, now: number) {
  if (!Number.isFinite(now) || !Number.isFinite(book.T) || now - book.T > 15000 || book.T > now + 3000) throw new Error('ספר הפקודות מיושן');
  if (!Number.isFinite(instrument.expiryDate) || instrument.expiryDate <= now || (instrument.status && instrument.status !== 'TRADING')) throw new Error('החוזה אינו פעיל');
  const lot = instrument.filters.find(f => f.filterType === 'LOT_SIZE');
  const step = Number(lot?.stepSize ?? instrument.filters.find(f => f.stepSize)?.stepSize);
  const min = Number(lot?.minQty ?? instrument.minQty);
  const max = Number(lot?.maxQty ?? instrument.maxQty);
  if (!(step > 0) || !(min > 0) || !(max >= min)) throw new Error('חסרים כללי כמות מהבורסה');
  if (!Number.isFinite(qty) || qty < min || qty > max || Math.abs(qty / step - Math.round(qty / step)) > 1e-7) throw new Error(`כמות לא תקינה: מינימום ${min}, צעד ${step}`);
  let remaining = qty, cost = 0, limit = 0;
  const asks = book.asks.map(([p, q]) => [Number(p), Number(q)]).filter(([p, q]) => Number.isFinite(p) && Number.isFinite(q) && p > 0 && q > 0).sort((a, b) => a[0] - b[0]);
  for (const [price, available] of asks) {
    const fill = Math.min(remaining, available);
    cost += price * fill; remaining -= fill; limit = price;
    if (remaining < 1e-9) break;
  }
  if (remaining > 1e-9) throw new Error('אין מספיק עומק לכמות המבוקשת');
  return { average: cost / qty, cost, limit, slippage: (cost / qty / asks[0][0] - 1) * 10000 };
}
