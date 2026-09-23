/** Print the evaluation report from the saved bot state:  npm run report */
import './env';
import { readFileSync } from 'node:fs';
import { CONFIG } from './config';
import { buildReport } from './report';
import type { BotState } from './types';

const s = JSON.parse(readFileSync(CONFIG.stateFile, 'utf8')) as BotState;
const r = buildReport(s);
const usd = (v: number) => `${v >= 0 ? '' : '-'}$${Math.abs(v).toFixed(2)}`;
console.log(`\nדוח בדיקה · התחלה ${new Date(r.startedAt).toISOString().slice(0, 16)} UTC · ${r.days.toFixed(1)} ימים`);
console.log(`תיק קבוע ${usd(r.capital)} → ${usd(r.endEquity)}  (${r.pnl >= 0 ? '+' : ''}${usd(r.pnl)}, ${(r.pnlPct * 100).toFixed(2)}%)`);
console.log(`עסקאות ${r.trades} · הצלחה ${(r.winRate * 100).toFixed(0)}% · PF ${r.profitFactor?.toFixed(2) ?? '∞'} · ירידה מקס׳ ${(r.maxDD * 100).toFixed(1)}% · עמלות ${usd(r.fees)}\n`);
console.log('יום         שווי        רו"ה');
for (const d of r.daily) console.log(`${d.day}  ${usd(d.equity).padStart(10)}  ${(d.pnl >= 0 ? '+' : '') + usd(d.pnl)} (${(d.pct * 100).toFixed(2)}%)`);
console.log('');
for (const c of r.checks) console.log(`${c.ok ? '✓' : '✗'} ${c.label}: ${c.value}`);
console.log(`\n${r.verdict}\n`);
