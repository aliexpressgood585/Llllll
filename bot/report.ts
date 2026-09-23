import type { BotState } from './types';

const DAY = 86400e3;

export interface Check {
  label: string;
  ok: boolean;
  value: string;
}

/**
 * Evaluation report for the paper-trading period: fixed-capital return after all fees, drawdown, trade statistics
 * and a go/no-go checklist before connecting real money. Equity is marked at the bid (what could actually be sold).
 */
export function buildReport(s: BotState, equityNow?: number) {
  const now = Date.now();
  const end = equityNow ?? s.equity[s.equity.length - 1]?.equity ?? s.capital;
  const lastT = s.equity[s.equity.length - 1]?.t ?? now;
  const days = (Math.max(lastT, equityNow !== undefined ? now : lastT) - s.startedAt) / DAY;
  const pnl = end - s.capital;
  const closed = s.closed;
  const wins = closed.filter((t) => t.pnl > 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = -closed.filter((t) => t.pnl <= 0).reduce((a, t) => a + t.pnl, 0);
  const pf = grossLoss > 0 ? grossWin / grossLoss : wins.length ? Infinity : 0;
  let peak = s.capital;
  let maxDD = 0;
  for (const p of s.equity) {
    peak = Math.max(peak, p.equity);
    maxDD = Math.max(maxDD, 1 - p.equity / peak);
  }
  // end-of-day equity per UTC day
  const byDay = new Map<number, number>();
  for (const p of s.equity) byDay.set(Math.floor(p.t / DAY), p.equity);
  const dayKeys = [...byDay.keys()].sort((a, b) => a - b);
  let prev = s.capital;
  const daily = dayKeys.map((d) => {
    const eq = byDay.get(d)!;
    const row = { day: new Date(d * DAY).toISOString().slice(0, 10), equity: eq, pnl: eq - prev, pct: eq / prev - 1 };
    prev = eq;
    return row;
  });
  const byStrategy = [...new Set(closed.map((t) => t.strategy))].map((k) => {
    const ts = closed.filter((t) => t.strategy === k);
    return { strategy: k, trades: ts.length, pnl: ts.reduce((a, t) => a + t.pnl, 0), winRate: ts.filter((t) => t.pnl > 0).length / ts.length };
  });
  const checks: Check[] = [
    { label: 'תקופת בדיקה של 7 ימים לפחות', ok: days >= 7, value: `${days.toFixed(1)} ימים` },
    { label: 'לפחות 15 עסקאות סגורות', ok: closed.length >= 15, value: String(closed.length) },
    { label: 'רווח נקי אחרי כל העמלות', ok: pnl > 0, value: `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}$ (${((pnl / s.capital) * 100).toFixed(2)}%)` },
    { label: 'Profit factor של 1.3 ומעלה', ok: pf >= 1.3, value: Number.isFinite(pf) ? pf.toFixed(2) : '∞' },
    { label: 'ירידה מקסימלית עד 15%', ok: maxDD <= 0.15, value: `${(maxDD * 100).toFixed(1)}%` },
    { label: 'הבוט לא נעצר על ידי מגבלת סיכון', ok: !s.halted, value: s.halted ? s.haltReason : 'תקין' },
  ];
  const passed = checks.every((c) => c.ok);
  return {
    startedAt: s.startedAt,
    days,
    capital: s.capital,
    endEquity: end,
    pnl,
    pnlPct: pnl / s.capital,
    fees: s.feesPaid,
    trades: closed.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    profitFactor: Number.isFinite(pf) ? pf : null,
    maxDD,
    daily,
    byStrategy,
    checks,
    verdict: passed
      ? 'עבר את כל הבדיקות — אפשר לשקול מעבר למסחר אמיתי בסכום קטן, ולהשוות את התוצאות בפועל לנייר'
      : days < 7
        ? 'תקופת הבדיקה עדיין לא הסתיימה'
        : 'לא עבר — לא לחבר כסף אמיתי במצב הנוכחי',
    passed,
  };
}

export type BotReport = ReturnType<typeof buildReport>;
