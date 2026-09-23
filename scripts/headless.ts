/** Headless soak test: run the engine for N sim-days and print desk statistics. `npx tsx scripts/headless.ts [days] [seed]` */
import { DeskEngine } from '../src/engine/engine';
import { STEPS_PER_HOUR } from '../src/engine/config';

const days = Number(process.argv[2] ?? 5);
const seed = Number(process.argv[3] ?? 42);
const e = new DeskEngine(seed);
const t0 = performance.now();
for (let d = 0; d < days; d++) {
  for (let i = 0; i < STEPS_PER_HOUR * 24; i++) e.step();
  const s = e.snapshot();
  console.log(
    `day ${d + 1}: eq $${s.account.equity.toFixed(0)} peak $${s.account.peak.toFixed(0)} maxDD ${(s.account.maxDD * 100).toFixed(0)}% trades ${s.account.trades} W/L ${s.account.wins}/${s.account.losses} liqs ${s.account.liqCount} blowups ${s.blowups} open ${s.strategies.length} util ${(s.account.marginUtil * 100).toFixed(0)}% BTC ${s.assets.BTC.spot.toFixed(0)} regime ${s.regime.hidden} conf ${(s.regime.confidence * 100).toFixed(0)}% fees $${s.account.fees.toFixed(0)} slip ${s.exec.avgSlipBp.toFixed(1)}bp`,
  );
}
const t1 = performance.now();
const snapT = performance.now();
e.snapshot();
console.log(`steps/ms ${(days * 24 * STEPS_PER_HOUR / (t1 - t0)).toFixed(2)}, snapshot ${(performance.now() - snapT).toFixed(1)}ms`);
console.log(JSON.stringify(e.kindStats));
if (process.argv[4]) console.log(e.alerts.slice(0, 25).map((a) => `${a.severity.padEnd(8)} ${a.text}`).join('\n'));
