/**
 * Offline end-to-end test of the futures desk: a synthetic 1-minute market (trends, chop, spikes) drives the
 * six agents for a simulated week on a simulated clock. Checks that every agent does its job, the accounting
 * reconciles to the cent, funding is settled, stops/targets/liquidation fire, and risk limits hold.
 *   npm run test:futures
 */
import { FCONFIG } from '../futures/config';
import { Desk } from '../futures/desk';
import { buildMarket, H, SimFeed, SPEC, T0 } from '../futures/simfeed';
import { liqPrice, walk } from '../futures/account';

const DAYS = Number(process.argv[2] ?? 7);
buildMarket(DAYS);

const fails: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) fails.push(msg); console.log(`${ok ? '✓' : '✗'} ${msg}`); };

// ---- unit checks
{
  const liq = liqPrice('LONG', 1, 100, 20, 0.005); // 5x long
  check(Math.abs(liq - (100 - 20) / 0.995) < 1e-9 && liq > 80 && liq < 81, `liquidation price 5x long ≈ ${liq.toFixed(2)}`);
  const s = liqPrice('SHORT', 1, 100, 20, 0.005);
  check(s > 119 && s < 120, `liquidation price 5x short ≈ ${s.toFixed(2)}`);
  const w = walk({ bids: [], asks: [[100, 1], [100.1, 1], [101, 5]] }, 'BUY', 2.5, 0.002);
  check(Math.abs(w.filled - 2) < 1e-9 && Math.abs(w.avg - 100.05) < 1e-9, 'order-book walk stops at the slippage limit');
}

// ---- simulated week
const feed = new SimFeed();
const cfg = { ...FCONFIG, symbols: Object.keys(SPEC) };
const desk = new Desk(feed, cfg, false);
await desk.loadSymbols();
await desk.scan();
await desk.candleTick();
let maxOpen = 0, maxLev = 0, fastTicks = 0, maxDD = 0;
const end = T0 + DAYS * 24 * H;
while (feed.t < end) {
  feed.t += cfg.fastMs;
  await desk.fastTick(); fastTicks++;
  if (fastTicks % Math.round(cfg.candleMs / cfg.fastMs) === 0) await desk.candleTick();
  maxOpen = Math.max(maxOpen, desk.acct.s.positions.length);
  for (const p of desk.acct.s.positions) maxLev = Math.max(maxLev, p.lev);
  if (fastTicks % 30 === 0) { const e = desk.equity(); maxDD = Math.max(maxDD, (desk.acct.s.peak - e) / desk.acct.s.peak); }
}
const snap = desk.snapshot();
const s = desk.acct.s;
const types = (t: string) => desk.counts[t as keyof typeof desk.counts] ?? 0;
console.log(`\n${DAYS} simulated days · equity $${snap.account.equity.toFixed(2)} (${(snap.account.returnPct * 100).toFixed(2)}%) · trades ${s.trades.length} · win ${(snap.stats.winRate * 100).toFixed(0)}% · avgR ${snap.stats.avgR.toFixed(2)} · fees $${s.feesPaid.toFixed(2)} · funding $${s.fundingNet.toFixed(2)} · maxDD ${(maxDD * 100).toFixed(1)}%`);
for (const a of snap.agents) console.log(`  ${a.title.padEnd(14)} actions=${a.done} errors=${a.errors} · last: ${a.history[0]?.text.slice(0, 90) ?? '—'}`);

check(snap.agents.every((a) => a.done > 0), 'every agent performed real actions');
check(snap.agents.every((a) => a.errors === 0), 'no agent errors');
check(s.trades.length > 0, `trades were opened and closed (${s.trades.length})`);
check(Number.isFinite(snap.account.equity), 'equity is a finite number');
check(maxOpen <= cfg.risk.maxPositions, `never more than ${cfg.risk.maxPositions} open positions (max seen ${maxOpen})`);
check(maxLev <= cfg.risk.maxLeverage, `leverage never above ${cfg.risk.maxLeverage}x (max seen ${maxLev}x)`);
const openAdj = s.positions.reduce((a, p) => a + p.funding - p.fees, 0);
const recon = cfg.capital + s.trades.reduce((a, t) => a + t.net, 0) + openAdj;
check(Math.abs(recon - s.wallet) < 1e-6, `wallet reconciles with the trade journal to the cent (${recon.toFixed(4)} vs ${s.wallet.toFixed(4)})`);
check(Math.abs(s.feesPaid - (s.trades.reduce((a, t) => a + t.fees, 0) + s.positions.reduce((a, p) => a + p.fees, 0))) < 1e-6, 'fees reconcile');
check(types('funding') > 0, `funding settled (${types('funding')} payments)`);
check(types('signal') > 0 && types('approve') > 0, `signals flow analyst → risk → trader (${types('signal')} signals, ${types('approve')} approved, ${types('reject')} rejected)`);
check(s.trades.every((t) => Math.abs(t.r) < 6 || t.reason.includes('חוסל')), 'losses bounded by the stop (no trade beyond ±6R)');
check(s.trades.every((t) => t.fees > 0), 'every trade paid fees on both legs');
check(desk.events.filter((e) => e.type === 'scan').length < 20, 'routine scans stay out of the shared event log');

// ---- liquidation + halt scenario on a fresh desk
{
  const f2 = new SimFeed(); f2.t = T0 + 2 * 24 * H;
  const d2 = new Desk(f2, { ...cfg, risk: { ...cfg.risk, maxDrawdown: 0.05 } }, false);
  await d2.loadSymbols(); await d2.scan();
  const q = d2.quotes.get('ETHUSDT')!;
  const margin = 200, qty = 1;
  d2.acct.open({ id: 'x', symbol: 'ETHUSDT', side: 'LONG', qty, entry: q.mark, lev: 16, margin, stop: 0, target: q.mark * 2, liq: liqPrice('LONG', qty, q.mark, margin, 0.005), riskUsd: 50, rDist: 50, openedAt: f2.t, reason: 'test', mmr: 0.005 }, 1);
  d2.quotes.set('ETHUSDT', { ...q, mark: q.mark * 0.9 }); // -10% crash through the liquidation price
  await d2.manage(); d2.treasury();
  const t = d2.acct.s.trades.at(-1);
  check(!!t && t.reason.includes('חוסל') && Math.abs(t.gross + margin) < 1e-9, 'liquidation closes the position and loses exactly the isolated margin');
  check(!!d2.acct.s.halted, 'drawdown beyond the limit halts new entries');
  const rej = d2.review({ symbol: 'BTCUSDT', side: 'LONG', entry: 64000, stop: 63000, target: 66000, atr: 500, reason: 't', candleT: 0 });
  check(rej === null && d2.events.at(-1)!.type === 'reject', 'risk manager rejects while halted');
}

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall futures desk checks passed');
process.exit(fails.length ? 1 : 0);
