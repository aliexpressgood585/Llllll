import { useEffect, useState } from 'react';
import { publicGet, estimateBuy } from '../live/binance';
import type { Book, Instrument } from '../live/binance';

type Quote = { symbol: string; book: Book; index: number; received: number; serverOffset: number };
const usd = (v: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v);

export function LiveMarket() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [symbol, setSymbol] = useState('');
  const [asset, setAsset] = useState('BTCUSDT');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [qty, setQty] = useState('0.01');
  const [feeBp, setFeeBp] = useState('3');
  const [feeCap, setFeeCap] = useState('10');

  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const abort = new AbortController();
    setError(''); setInstruments([]); setQuote(null);
    publicGet<{ optionSymbols: Instrument[]; serverTime: number }>('exchangeInfo', abort.signal).then(data => {
      if (!Array.isArray(data.optionSymbols)) throw new Error('תשובה לא תקינה מהבורסה');
      const rows = data.optionSymbols.filter(x => x.expiryDate > data.serverTime && (!x.status || x.status === 'TRADING'));
      if (!rows.length) throw new Error('לא התקבלו חוזים פעילים');
      setInstruments(rows.sort((a, b) => a.expiryDate - b.expiryDate || Number(a.strikePrice) - Number(b.strikePrice)));
    }).catch(e => { if (!abort.signal.aborted) setError(String(e.message)); });
    return () => abort.abort();
  }, [retry]);

  const choices = instruments.filter(i => i.underlying === asset && i.expiryDate > clock);
  const selected = choices.find(i => i.symbol === symbol) ?? choices[0];
  const selectedSymbol = selected?.symbol;
  useEffect(() => {
    if (selected) setQty(selected.minQty);
  }, [selected]);
  useEffect(() => {
    if (!selectedSymbol) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setQuote(null);
    const poll = async () => {
      try {
        const [book, index, time] = await Promise.all([
          publicGet<Book>(`depth?symbol=${encodeURIComponent(selectedSymbol)}&limit=20`, abort.signal),
          publicGet<{ indexPrice: string }>(`index?underlying=${encodeURIComponent(asset)}`, abort.signal),
          publicGet<{ serverTime: number }>('time', abort.signal),
        ]);
        if (!Array.isArray(book.asks) || !Array.isArray(book.bids) || !(Number(index.indexPrice) > 0) || !Number.isFinite(time.serverTime)) throw new Error('נתוני שוק לא תקינים');
        if (!abort.signal.aborted) {
          setQuote({ symbol: selectedSymbol, book, index: Number(index.indexPrice), received: Date.now(), serverOffset: time.serverTime - Date.now() });
          setError('');
        }
      } catch (e) { if (!abort.signal.aborted) { setError(e instanceof Error ? e.message : 'החיבור נכשל'); setQuote(null); } }
      finally { if (!abort.signal.aborted) timer = setTimeout(poll, 10000); }
    };
    void poll();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [selectedSymbol, asset, retry]);

  const fresh = quote && quote.symbol === selectedSymbol && clock - quote.received < 15000 && Number.isFinite(quote.book.T) && Math.abs(clock + quote.serverOffset - quote.book.T) < 15000;
  let estimate: ReturnType<typeof estimateBuy> | null = null, problem = '';
  if (fresh && selected && quote) {
    try { estimate = estimateBuy(selected, quote.book, Number(qty), clock + quote.serverOffset); }
    catch (e) { problem = e instanceof Error ? e.message : 'כמות לא תקינה'; }
  }
  const feeValid = Number.isFinite(Number(feeBp)) && Number(feeBp) >= 0 && Number(feeBp) <= 100 && Number.isFinite(Number(feeCap)) && Number(feeCap) >= 0 && Number(feeCap) <= 100;
  const fee = estimate && quote && feeValid ? Math.min(quote.index * Number(qty) * Number(feeBp) / 10000, estimate.cost * Number(feeCap) / 100) : null;
  return (
    <section className="rounded-xl border border-line2 bg-panel p-4 sm:p-5" aria-label="נתוני Binance ציבוריים">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="num text-xs tracking-widest text-accent">NEXUS / BINANCE OPTIONS</p><h2 className="mt-1 text-xl font-bold text-white">שוק אמיתי · בדיקת ביצוע</h2></div>
        <span role="status" className={`rounded-full border px-3 py-1 text-sm ${fresh && !error ? 'border-up/30 text-up' : 'border-warn/30 text-warn'}`}>{fresh && !error ? 'נתונים ציבוריים מחוברים' : error ? 'הנתונים אינם זמינים' : 'ממתין לנתונים עדכניים'}</span>
      </div>
      <p className="my-3 text-sm text-dim">חוזים וספר פקודות מ־Binance. בדיקת עלות בלבד; אין חיבור לחשבון ואין שליחת עסקאות.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">נכס<select className="mt-1 block rounded border border-line2 bg-panel2 px-3" value={asset} onChange={e => { setAsset(e.target.value); setSymbol(''); }}>{['BTCUSDT','ETHUSDT','SOLUSDT'].map(a => <option key={a}>{a}</option>)}</select></label>
        <label className="min-w-0 flex-1 text-sm">חוזה פעיל<select dir="ltr" className="mt-1 block w-full rounded border border-line2 bg-panel2 px-3" value={selectedSymbol ?? ''} onChange={e => setSymbol(e.target.value)}>{!choices.length && <option value="">אין חוזים זמינים</option>}{choices.map(i => <option key={i.symbol} value={i.symbol}>{i.symbol}</option>)}</select></label>
        <button className="rounded border border-line2 px-4 text-sm" onClick={() => setRetry(r => r + 1)}>רענון חיבור</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-warn">{error} · ייתכן שהגישה ל־Binance חסומה באזור או בדפדפן. לא מוצגים נתונים חלופיים.</p>}
      <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['מדד בסיס', fresh && quote ? usd(quote.index) : '—'], ['קנייה / Ask', fresh && quote?.book.asks[0] ? usd(Number(quote.book.asks[0][0])) : '—'], ['מכירה / Bid', fresh && quote?.book.bids[0] ? usd(Number(quote.book.bids[0][0])) : '—'], ['גיל נתונים', fresh && quote ? `${Math.max(0, Math.round((clock - quote.received) / 1000))}s` : '—']].map(([label, value]) => <div key={label} className="rounded-lg border border-line bg-panel2 p-3"><p className="text-sm text-dim">{label}</p><p dir="ltr" className="mt-1 text-end font-mono text-lg text-white">{value}</p></div>)}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">כמות יחידות בסיס<input aria-label="כמות יחידות בסיס" className="mt-1 block w-32 rounded border border-line2 bg-panel2 px-3" type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} /></label>
        <label className="text-sm">עמלה משוערת (bps)<input className="mt-1 block w-32 rounded border border-line2 bg-panel2 px-3" type="number" min="0" max="100" step="0.1" value={feeBp} onChange={e => setFeeBp(e.target.value)} /></label>
        <label className="text-sm">תקרת עמלה (% פרמיה)<input className="mt-1 block w-32 rounded border border-line2 bg-panel2 px-3" type="number" min="0" max="100" step="0.1" value={feeCap} onChange={e => setFeeCap(e.target.value)} /></label>
      </div>
      <p className="mt-3 text-sm text-dim">העמלות הן הנחת חישוב ניתנת לעריכה, ולא תעריף מאומת לחשבונך. אומדן הקנייה עובר על עומק ה־Ask; אין הנחת מילוי במחיר Mark.</p>
      <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm" aria-live="polite">{estimate && fee !== null ? `עלות משוערת כולל עמלה: ${usd(estimate.cost + fee)} USDT · מחיר ממוצע ${usd(estimate.average)} · החלקה ${estimate.slippage.toFixed(1)} bps · מחיר הגבלה נדרש ${usd(estimate.limit)}` : problem || (!feeValid ? 'ערכי עמלה לא תקינים' : 'אומדן יוצג רק עם חוזה וספר פקודות עדכניים.')}</div>
      <p className="mt-2 text-xs text-dim">תצלום עומק בלבד: אינו מבטיח מילוי, ואינו כולל שינוי מחיר בזמן שליחה. רענון כל 10 שניות.</p>
    </section>
  );
}
