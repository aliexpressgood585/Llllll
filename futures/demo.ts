/**
 * `npm run futures:demo` — the same desk and page on a SYNTHETIC market at 30× speed, to see the agents work
 * without Binance access. Nothing here is real market data; the page says so.
 */
import { FCONFIG } from './config';
import { Desk } from './desk';
import { weeklyReport } from './report';
import { startServer } from './server';
import { buildMarket, SimFeed, SPEC, T0 } from './simfeed';

buildMarket(14, Date.now() - 3600e3);
const feed = new SimFeed();
feed.t = T0;
const cfg = { ...FCONFIG, symbols: Object.keys(SPEC), mode: "demo" as const, port: Number(process.env.FUT_PORT ?? 8789) };
const desk = new Desk(feed, cfg, false);
await desk.loadSymbols(); await desk.scan(); await desk.candleTick();
startServer(cfg.port, cfg.host, () => desk.snapshot(), (a) => desk.control(a), () => weeklyReport(desk));
let n = 0, busy = false;
setInterval(async () => {
  if (busy) return; busy = true;
  try { feed.t += cfg.fastMs; await desk.fastTick(); if (++n % 6 === 0) await desk.candleTick(); } finally { busy = false; }
}, Number(process.env.FUT_DEMO_TICK_MS ?? 333));
