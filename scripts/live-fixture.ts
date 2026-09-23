/**
 * Offline test of the live pipeline: a mock Deribit JSON-RPC server answers in the documented response
 * formats (backed by the synthetic market), and LiveMarket + DeskEngine paper-trade against it.
 * `npx tsx scripts/live-fixture.ts [hours]`
 */
import { DeskEngine } from '../src/engine/engine';
import { MarketSim } from '../src/engine/market';
import { listExpiries } from '../src/engine/time';
import type { Asset } from '../src/engine/types';
import { Rng } from '../src/lib/rng';
import { DERIBIT, LiveMarket } from '../src/live/liveMarket';
import type { RpcClient } from '../src/live/deribitClient';

let clock = Date.UTC(2026, 8, 23, 10, 0, 0);
Date.now = () => clock;
const sim = new MarketSim(new Rng(7), clock);
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const code = (ts: number) => {
  const d = new Date(ts);
  return `${d.getUTCDate()}${MON[d.getUTCMonth()]}${String(d.getUTCFullYear()).slice(2)}`;
};
const name = (a: Asset, e: number, k: number, t: 'C' | 'P') => `${DERIBIT[a].prefix}${code(e)}-${String(k).replace('.', 'd')}-${t}`;

function instruments(cur: string) {
  const out = [];
  for (const a of ['BTC', 'ETH', 'SOL'] as Asset[]) {
    if (DERIBIT[a].currency !== cur) continue;
    for (const e of listExpiries(clock))
      for (const k of sim.strikes(a, e, clock))
        for (const t of ['C', 'P'] as const)
          out.push({ instrument_name: name(a, e, k, t), expiration_timestamp: e, strike: k, option_type: t === 'C' ? 'call' : 'put', min_trade_amount: a === 'BTC' ? 0.1 : a === 'ETH' ? 1 : 1, tick_size: DERIBIT[a].inverse ? 0.0001 : 0.01 });
  }
  return out;
}

function books(cur: string) {
  const out = [];
  for (const a of ['BTC', 'ETH', 'SOL'] as Asset[]) {
    if (DERIBIT[a].currency !== cur) continue;
    const S = sim.assets[a].spot;
    const conv = (p: number) => (DERIBIT[a].inverse ? p / S : p);
    for (const e of listExpiries(clock))
      for (const k of sim.strikes(a, e, clock))
        for (const t of ['C', 'P'] as const) {
          const q = sim.quote({ asset: a, expiry: e, strike: k, type: t }, clock);
          out.push({ instrument_name: name(a, e, k, t), bid_price: q.bid > 0 ? conv(q.bid) : null, ask_price: conv(q.ask), mark_price: conv(q.mark), mark_iv: q.iv * 100, underlying_price: S, open_interest: q.oi, volume: q.volume });
        }
  }
  return out;
}

const calls: Record<string, number> = {};
const rpc: RpcClient = {
  async call<T>(method: string, p: Record<string, unknown> = {}): Promise<T> {
    calls[method] = (calls[method] ?? 0) + 1;
    const asset = (Object.keys(DERIBIT) as Asset[]).find((a) => DERIBIT[a].index === p.index_name || DERIBIT[a].perp === p.instrument_name);
    switch (method) {
      case 'public/get_instruments':
        return instruments(String(p.currency)) as T;
      case 'public/get_book_summary_by_currency':
        return books(String(p.currency)) as T;
      case 'public/get_index_price':
        return { index_price: sim.assets[asset!].spot, estimated_delivery_price: sim.assets[asset!].spot } as T;
      case 'public/ticker':
        return { funding_8h: 0.0001, open_interest: asset === 'SOL' ? 2e6 : 5e8, index_price: sim.assets[asset!].spot } as T;
      case 'public/get_tradingview_chart_data': {
        const h = sim.assets[asset!].history;
        const close = h.slice(-1440);
        return { status: 'ok', ticks: close.map((_, i) => clock - (close.length - i) * 60e3), close } as T;
      }
      case 'public/get_volatility_index_data':
        return { data: Array.from({ length: 720 }, (_, i) => [clock - (720 - i) * 3600e3, 50, 52, 48, 45 + 10 * Math.sin(i / 50)]) } as T;
      default:
        throw new Error(`unmocked ${method}`);
    }
  },
  close() {},
};

const hours = Number(process.argv[2] ?? 12);
// give the underlying sim some history first
for (let i = 0; i < 800; i++) sim.step((clock += 60e3));

const live = new LiveMarket(rpc);
await live.init();
live.stop(); // stop timers; the test drives refreshes manually
const e = new DeskEngine({ market: live });
console.log('status', live.status().state, live.status().detail, 'expiries', live.expiries(clock).length, 'BTC spec', live.spec('BTC'), 'SOL spec', live.spec('SOL'));
const s0 = e.snapshot();
console.log('spot', s0.assets.BTC.spot.toFixed(0), 'atmIv', s0.assets.BTC.atmIv.toFixed(3), 'longIv', s0.assets.BTC.longIv.toFixed(3), 'skew', s0.assets.BTC.skew.toFixed(2), 'chain rows', s0.chains.BTC.length, 'clusters', s0.assets.BTC.clusters.length);
const r = s0.chains.BTC.find((x) => x.bid > 0 && Math.abs(x.delta) > 0.3 && Math.abs(x.delta) < 0.6)!;
console.log('sample row', r.symbol, 'bid', r.bid.toFixed(1), 'ask', r.ask.toFixed(1), 'mark', r.mark.toFixed(1), 'iv', r.iv.toFixed(3), 'delta', r.delta.toFixed(3));

for (let i = 0; i < hours * 30; i++) {
  clock += 120e3;
  sim.step(clock);
  if (i % 3 === 0) {
    await live.refreshIndex();
    await live.refreshBooks();
  }
  if (i % 7 === 0) live.onLiquidation({ time: clock, asset: 'BTC', side: i % 2 ? 'LONG' : 'SHORT', notional: 250000 + i * 1000, price: sim.assets.BTC.spot });
  e.step();
}
const s = e.snapshot();
console.log(`after ${hours}h: equity $${s.account.equity.toFixed(0)} trades ${s.account.trades} open ${s.strategies.length} fills ${s.exec.fills} rejects ${(s.exec.rejectRate * 100).toFixed(1)}% liq1h $${(s.assets.BTC.liq1hLong + s.assets.BTC.liq1hShort).toFixed(0)} VaR $${s.risk.var95.toFixed(0)}`);
console.log(s.strategies.map((x) => `${x.label} size ${x.size} pnl ${x.pnl.toFixed(0)}`).join('\n'));
const st = e.exportState();
const e2 = new DeskEngine({ market: live });
e2.importState(JSON.parse(JSON.stringify(st)));
console.log('persist roundtrip equity', e2.snapshot().account.equity.toFixed(0), 'vs', s.account.equity.toFixed(0));
console.log('rpc calls', calls);
console.log(s.alerts.slice(0, 8).map((a) => a.text).join('\n'));
