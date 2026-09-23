/**
 * Offline end-to-end test of the Binance bot. A fake Binance client answers in the published response formats
 * (backed by the synthetic market), time is accelerated, and the bot trades, exits and settles.
 *   npm run test:bot [days]
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { rmSync } from 'node:fs';

process.env.BOT_STATE_FILE = '/tmp/bot-fixture-state.json';
process.env.BOT_JOURNAL_FILE = '/tmp/bot-fixture-trades.csv';
process.env.BOT_DECISION_MS = '0';
rmSync('/tmp/bot-fixture-state.json', { force: true });
rmSync('/tmp/bot-fixture-trades.csv', { force: true });

const { MarketSim } = await import('../src/engine/market');
const { listExpiries } = await import('../src/engine/time');
const { Rng } = await import('../src/lib/rng');
const { BinanceClient } = await import('../bot/binanceClient');
const { OptionsMarket } = await import('../bot/market');
const { PaperBroker, walkBook } = await import('../bot/broker');
const { TradingBot } = await import('../bot/bot');
const { tradeFee, exerciseFee } = await import('../bot/fees');

// ---- 1. HMAC signature matches Binance's published example
{
  const secret = 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j';
  const q = 'symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559';
  assert.equal(createHmac('sha256', secret).update(q).digest('hex'), 'c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71');
  console.log('✓ HMAC signing matches Binance example');
}
// ---- 2. Fee formula matches Binance's FAQ example: 3 ETH options @1000, index 2000 → min(0.03%*2000, 10%*1000)*3 = 1.8
{
  const c = { symbol: 'ETH-X', underlying: 'ETHUSDT', expiry: 0, strike: 2000, side: 'CALL' as const, unit: 1, minQty: 0.01, maxQty: 100, step: 0.01, tick: 0.1, takerFee: 0.0003 };
  assert.ok(Math.abs(tradeFee(c, 2000, 1000, 3) - 1.8) < 1e-9);
  assert.ok(Math.abs(tradeFee(c, 2000, 2, 3) - 0.6) < 1e-9); // capped at 10% of a cheap option's price
  assert.ok(Math.abs(exerciseFee(c, 2100, 100, 2) - 0.63) < 1e-9);
  console.log('✓ fee formulas match Binance FAQ');
}
// ---- 3. Book walking respects limit, depth and lot step
{
  const book = { T: 0, u: 0, asks: [['100', '0.05'], ['101', '0.10'], ['110', '5']] as [string, string][], bids: [['99', '0.02']] as [string, string][] };
  const w = walkBook(book, 'BUY', 0.2, 102, 0.01);
  assert.equal(w.filled, 0.15);
  assert.ok(Math.abs(w.avg - (100 * 0.05 + 101 * 0.1) / 0.15) < 1e-9);
  assert.equal(walkBook(book, 'SELL', 1, 99, 0.01).filled, 0.02);
  console.log('✓ order-book walk (limit / depth / step)');
}

// ---- 4. End-to-end with accelerated time
let clock = Date.UTC(2026, 8, 23, 9, 0, 0);
const realNow = Date.now;
Date.now = () => clock;
const sim = new MarketSim(new Rng(11), clock);
for (let i = 0; i < 1200; i++) sim.step((clock += 60e3));
const U: Record<string, 'BTC' | 'ETH' | 'SOL'> = { BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL' };
const code = (e: number) => new Date(e).toISOString().slice(2, 10).replace(/-/g, '');
const sym = (u: string, e: number, k: number, t: 'C' | 'P') => `${U[u]}-${code(e)}-${k}-${t}`;
const listed = new Map<string, { u: string; e: number; k: number; t: 'C' | 'P' }>();
const settled: { symbol: string; strikePrice: string; realStrikePrice: string; expiryDate: number; strikeResult: string }[] = [];
const seenExpiry = new Set<number>();

function refreshListing() {
  for (const u of Object.keys(U))
    for (const e of listExpiries(clock))
      for (const k of sim.strikes(U[u], e, clock))
        for (const t of ['C', 'P'] as const) listed.set(sym(u, e, k, t), { u, e, k, t });
  for (const [s, v] of listed)
    if (v.e <= clock && !seenExpiry.has(v.e * 10 + Object.keys(U).indexOf(v.u))) {
      /* settlement handled below */
    }
}
refreshListing();

class FakeClient extends BinanceClient {
  constructor() {
    super('http://fake', 'http://fake');
  }
  exchangeInfo = async () => ({
    serverTime: clock,
    optionSymbols: [...listed].filter(([, v]) => v.e > clock).map(([s, v]) => ({
      symbol: s, underlying: v.u, expiryDate: v.e, strikePrice: String(v.k), side: v.t === 'C' ? ('CALL' as const) : ('PUT' as const), unit: 1,
      minQty: '0.01', maxQty: '500', makerFeeRate: '0.0002', takerFeeRate: '0.0003', priceScale: 1, quantityScale: 2, quoteAsset: 'USDT',
      filters: [{ filterType: 'PRICE_FILTER', minPrice: '0.1', maxPrice: '100000', tickSize: '0.1' }, { filterType: 'LOT_SIZE', minQty: '0.01', maxQty: '500', stepSize: '0.01' }],
    })),
  });
  private q(s: string) {
    const v = listed.get(s)!;
    return sim.quote({ asset: U[v.u], expiry: v.e, strike: v.k, type: v.t }, clock);
  }
  index = async (u: string) => ({ time: clock, indexPrice: String(sim.assets[U[u]].spot) });
  mark = async () => [...listed].filter(([, v]) => v.e > clock).map(([s]) => {
    const q = this.q(s);
    return { symbol: s, markPrice: String(q.mark), bidIV: String(q.iv * 0.97), askIV: String(q.iv * 1.03), markIV: String(q.iv), delta: String(q.delta), theta: String(q.theta), gamma: String(q.gamma), vega: String(q.vega), highPriceLimit: '0', lowPriceLimit: '0' };
  });
  ticker = async () => [...listed].filter(([, v]) => v.e > clock).map(([s]) => {
    const q = this.q(s);
    return { symbol: s, lastPrice: String(q.mark), bidPrice: String(q.bid), askPrice: String(q.ask), volume: String(q.volume), amount: '0', exercisePrice: '0' };
  });
  depth = async (s: string) => {
    const q = this.q(s);
    const lvl = (p: number, dir: number) => Array.from({ length: 5 }, (_, i) => [String(Math.max(0.1, +(p + dir * i * Math.max(0.1, p * 0.01)).toFixed(1))), String((q.askSize / 10 + 0.05 * i).toFixed(2))] as [string, string]);
    return { T: clock, u: 1, bids: q.bid > 0 ? lvl(q.bid, -1) : [], asks: lvl(q.ask, 1) };
  };
  exerciseHistory = async (u: string) => settled.filter((r) => listed.get(r.symbol)?.u === u);
  klines = async (s: string, _i: string, limit: number) => {
    const h = sim.assets[U[s]].history.slice(-limit);
    return h.map((c, i) => [clock - (h.length - i) * 60e3, '0', '0', '0', String(c)]);
  };
  time = async () => ({ serverTime: clock });
}

const api = new FakeClient();
const market = new OptionsMarket(api, Object.keys(U));
await market.loadInfo();
await market.refreshQuotes();
await market.refreshHistory();
const bot = new TradingBot(market, new PaperBroker(market));

const days = Number(process.argv[2] ?? 6);
for (let m = 0; m < days * 24 * 60; m++) {
  clock += 60e3;
  sim.step(clock);
  // Binance publishes settlement shortly after 08:00 UTC expiry
  for (const [s, v] of listed) if (v.e <= clock - 5 * 60e3 && !settled.some((r) => r.symbol === s)) settled.push({ symbol: s, strikePrice: String(v.k), realStrikePrice: String(sim.assets[U[v.u]].spot), expiryDate: v.e, strikeResult: 'REALISTIC_VALUE_STRICKEN' });
  if (m % 60 === 0) {
    refreshListing();
    await market.loadInfo();
    await market.refreshHistory();
  }
  if (m % 5 === 0) await bot.tick();
}
Date.now = realNow;

const s = bot.state;
const eq = bot.equity();
console.log(`\n${days} days: equity(bid) $${eq.bid.toFixed(2)} (mark $${eq.mark.toFixed(2)}) · cash $${s.cash.toFixed(2)} · open ${s.positions.length} · closed ${s.closed.length} · fees $${s.feesPaid.toFixed(2)} · halted ${s.halted}`);
const settles = s.fills.filter((f) => f.side === 'SETTLE').length;
console.log(`fills ${s.fills.length} (settlements ${settles}) · signals ${s.signals.length} (entered ${s.signals.filter((x) => x.action === 'entered').length})`);
console.log(s.closed.slice(0, 8).map((t) => `${t.strategy} ${t.underlying} ${t.exitReason} pnl ${t.pnl.toFixed(2)} (${(t.pnlPct * 100).toFixed(0)}%)`).join('\n'));
console.log('skip reasons:', [...new Set(s.signals.filter((x) => x.skipReason).map((x) => x.skipReason))].slice(0, 6));

// accounting identity: capital + realised pnl of closed trades - open positions' cost + proceeds so far == cash
const realised = s.closed.reduce((a, t) => a + t.pnl, 0);
const openNet = s.positions.reduce((a, p) => a + (p.proceeds ?? 0) - p.cost, 0);
assert.ok(Math.abs(s.capital + realised + openNet - s.cash) < 1e-6, `cash reconciliation failed: ${s.capital + realised + openNet} vs ${s.cash}`);
assert.ok(s.cash >= -1e-9, 'cash never negative (buy-only, fixed capital)');
assert.ok(s.fills.length > 0, 'bot traded');
console.log('✓ cash reconciles with journal; never negative; fixed capital respected');
