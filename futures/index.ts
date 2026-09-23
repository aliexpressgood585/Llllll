/**
 * Futures desk — entry point.  `npm run futures`
 * Paper trading on Binance USDⓈ-M perpetuals: real marks, funding, candles and order books; simulated fills.
 */
import '../bot/env';
import { FCONFIG } from './config';
import { Desk } from './desk';
import { BinanceFuturesFeed } from './feed';
import { weeklyReport } from './report';
import { startServer } from './server';

async function main() {
  const desk = new Desk(new BinanceFuturesFeed(FCONFIG.base), FCONFIG);
  console.log(`futures desk · paper · capital ${FCONFIG.capital} USDT · ${FCONFIG.symbols.join(',')}`);
  try {
    await desk.loadSymbols();
    await desk.scan();
  } catch (e) {
    console.error(`Cannot reach Binance futures: ${e instanceof Error ? e.message : e}`);
    console.error('Binance blocks some regions (US IPs get 451). Run the desk from a machine/VPS in a supported region.');
    process.exit(1);
  }
  startServer(FCONFIG.port, FCONFIG.host, () => desk.snapshot(), (a) => desk.control(a), () => weeklyReport(desk));
  await desk.candleTick();
  let busy = false;
  const guard = (fn: () => Promise<void>) => async () => { if (busy) return; busy = true; try { await fn(); } finally { busy = false; } };
  setInterval(guard(() => desk.fastTick()), FCONFIG.fastMs);
  setInterval(guard(() => desk.candleTick()), FCONFIG.candleMs);
  setInterval(() => desk.loadSymbols().catch(() => {}), 6 * 3600e3);
  const stop = () => { desk.save(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
main().catch((e) => { console.error(e); process.exit(1); });
