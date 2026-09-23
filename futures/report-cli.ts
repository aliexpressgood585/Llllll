/** `npm run futures:report` — prints the weekly report from the saved desk state (does not trade). */
import '../bot/env';
import { FCONFIG } from './config';
import { Desk } from './desk';
import { BinanceFuturesFeed } from './feed';
import { weeklyReport } from './report';

const desk = new Desk(new BinanceFuturesFeed(FCONFIG.base), FCONFIG);
try { await desk.scan(); } catch { /* offline: report with entry prices */ }
console.log(weeklyReport(desk));
