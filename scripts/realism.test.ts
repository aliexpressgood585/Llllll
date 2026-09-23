import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateBuy } from '../src/live/binance';
import { DeskEngine } from '../src/engine/engine';
import { SimExecution } from '../src/engine/execution';
import { Rng } from '../src/lib/rng';
import type { Instrument, Book } from '../src/live/binance';
const now = 1800000000000;
const instrument: Instrument = { symbol: 'BTC-270115-100000-C', underlying: 'BTCUSDT', expiryDate: now + 100000, strikePrice: '100000', side: 'CALL', unit: 1, minQty: '0.01', maxQty: '10', quantityScale: 2, status: 'TRADING', filters: [{ filterType: 'LOT_SIZE', stepSize: '0.01', minQty: '0.01', maxQty: '10' }] };
const book: Book = { T: now, asks: [['100', '0.01'], ['120', '0.02']], bids: [['90', '0.03']] };
test('walks actual ask depth, not mark or bid', () => {
  const r = estimateBuy(instrument, book, 0.03, now);
  assert.ok(Math.abs(r.cost - 3.4) < 1e-9);
  assert.equal(r.limit, 120);
  assert.ok(r.slippage > 0);
});
test('fails closed for stale depth, invalid quantities, expiry and insufficient liquidity', () => {
  for (const qty of [0, -1, NaN, Infinity, 0.015, 11, 0.04]) assert.throws(() => estimateBuy(instrument, book, qty, now));
  assert.throws(() => estimateBuy(instrument, book, .01, now + 16000));
  assert.throws(() => estimateBuy(instrument, { ...book, T: NaN }, .01, now));
  assert.throws(() => estimateBuy({ ...instrument, expiryDate: now }, book, .01, now));
  assert.throws(() => estimateBuy({ ...instrument, filters: [] }, book, .01, now));
});
test('warmup ends at supplied time and seeded paths repeat', () => {
  const a = new DeskEngine({ seed: 42, startTime: now }), b = new DeskEngine({ seed: 42, startTime: now });
  assert.equal(a.now, now);
  for (let i = 0; i < 100; i++) { a.step(); b.step(); }
  assert.equal(a.cash, b.cash);
  assert.equal(a.market.assets.BTC.spot, b.market.assets.BTC.spot);
});
test('bankrupt account is never automatically replenished', () => {
  const e = new DeskEngine({ seed: 42, startTime: now }); e.cash = -20;
  for (let i = 0; i < 60; i++) e.step();
  assert.equal(e.cash, -20);
  assert.equal(e.attempt, 1);
  assert.equal(e.blowups, 1);
  assert.equal(e.strategies.length, 0);
});
test('preferred venue uses its own touch and rounding never improves fills', () => {
  const e = new DeskEngine({ seed: 42, startTime: now }), ex = new SimExecution(e.market, new Rng(7));
  const key = { asset: 'BTC' as const, expiry: now + 86400000, strike: 68000, type: 'C' as const };
  const quote = e.market.quote(key, now);
  const r = ex.execute({ ...key, qty: .01, preferVenue: 'BINANCE', liquidation: true }, now);
  assert.equal(r.venue, 'BINANCE'); assert.equal(r.touch, quote.ask); assert.ok(r.price >= r.touch);
  assert.equal(ex.execute({ ...key, qty: NaN }, now).ok, false);
});
