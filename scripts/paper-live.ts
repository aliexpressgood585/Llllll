/**
 * 24/7 headless paper trading on live Deribit + Binance data (Node ≥ 22, which ships WebSocket).
 * State is saved to paper-state.json after every step, so it resumes after restarts.
 *   npm run paper
 * Nothing is ever sent to an exchange: fills are simulated against live quotes.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { SIM_MINUTES_PER_STEP } from '../src/engine/config';
import { DeskEngine, type PaperState } from '../src/engine/engine';
import { BinanceLiquidationStream } from '../src/live/binanceLiquidations';
import { DeribitWsClient } from '../src/live/deribitClient';
import { LiveMarket } from '../src/live/liveMarket';

const FILE = process.env.PAPER_STATE ?? 'paper-state.json';
const market = new LiveMarket(new DeribitWsClient());
const liqs = new BinanceLiquidationStream(market.onLiquidation);
market.liqStreamConnected = () => liqs.connected;

try {
  await market.init();
} catch (e) {
  console.error(`Cannot reach Deribit public API (wss://www.deribit.com/ws/api/v2): ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
liqs.start();
const engine = new DeskEngine({ market });
if (existsSync(FILE)) engine.importState(JSON.parse(readFileSync(FILE, 'utf8')) as PaperState);

const tick = () => {
  try {
    engine.step();
    writeFileSync(FILE, JSON.stringify(engine.exportState()));
    const s = engine.snapshot();
    const a = s.account;
    console.log(
      `${new Date().toISOString()} [${s.source.state}] BTC ${s.assets.BTC.spot.toFixed(0)} · equity $${a.equity.toFixed(2)} (${(a.totalReturn * 100).toFixed(1)}%) · maxDD ${(a.maxDD * 100).toFixed(1)}% · trades ${a.trades} W/L ${a.wins}/${a.losses} · open ${s.strategies.length} · fees $${a.fees.toFixed(2)} · liqs ${a.liqCount} · wipeouts ${s.blowups}`,
    );
  } catch (e) {
    console.error('step failed', e);
  }
};
tick();
setInterval(tick, SIM_MINUTES_PER_STEP * 60e3);
process.on('SIGINT', () => {
  writeFileSync(FILE, JSON.stringify(engine.exportState()));
  market.stop();
  liqs.stop();
  process.exit(0);
});
