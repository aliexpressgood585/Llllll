import type { Desk } from './desk';

/** Weekly evaluation in Markdown: performance, risk, costs, per-symbol breakdown and what each agent did. */
export function weeklyReport(desk: Desk): string {
  const snap = desk.snapshot();
  const now = snap.now, since = now - 7 * 86400e3;
  const s = desk.acct.s;
  const week = s.trades.filter((t) => t.closedAt >= since);
  const curve = s.curve.filter((c) => c.t >= since);
  const startEq = curve[0]?.e ?? s.capital;
  const eq = snap.account.equity;
  let peak = startEq, mdd = 0;
  for (const c of [...curve, { t: now, e: eq }]) { peak = Math.max(peak, c.e); mdd = Math.max(mdd, (peak - c.e) / peak); }
  const wins = week.filter((t) => t.net > 0), losses = week.filter((t) => t.net <= 0);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const pf = sum(losses.map((t) => -t.net)) > 0 ? sum(wins.map((t) => t.net)) / sum(losses.map((t) => -t.net)) : wins.length ? Infinity : 0;
  const f = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
  const p = (v: number) => `${(v * 100).toFixed(2)}%`;
  const bySym = new Map<string, typeof week>();
  for (const t of week) bySym.set(t.symbol, [...(bySym.get(t.symbol) ?? []), t]);
  const ev = desk.events.filter((e) => e.t >= since);
  const lines = [
    `# דוח שבועי — דסק פיוצ'רס (${new Date(since).toISOString().slice(0, 10)} עד ${new Date(now).toISOString().slice(0, 10)})`,
    '',
    `מצב: **${snap.mode === 'paper' ? 'נייר — מחירים וספר פקודות אמיתיים של Binance, ביצוע מדומה' : snap.mode}** · הון קבוע ${f(s.capital)}`,
    '',
    '## ביצועים',
    `- הון עכשיו: **${f(eq)}** (${p((eq - s.capital) / s.capital)} מההתחלה, ${p((eq - startEq) / startEq)} השבוע)`,
    `- עסקאות שנסגרו השבוע: ${week.length} · הצלחה ${week.length ? p(wins.length / week.length) : '—'} · Profit factor ${Number.isFinite(pf) ? pf.toFixed(2) : '∞'}`,
    `- ממוצע R לעסקה: ${week.length ? (sum(week.map((t) => t.r)) / week.length).toFixed(2) : '—'} · הטובה ${week.length ? f(Math.max(...week.map((t) => t.net))) : '—'} · הגרועה ${week.length ? f(Math.min(...week.map((t) => t.net))) : '—'}`,
    `- ירידה מקסימלית השבוע: ${p(mdd)}`,
    '',
    '## עלויות',
    `- עמלות השבוע: ${f(sum(week.map((t) => t.fees)))} · מימון נטו: ${f(sum(week.map((t) => t.funding)))}`,
    '',
    '## לפי חוזה',
    '| חוזה | עסקאות | נטו | הצלחה |',
    '|---|---|---|---|',
    ...[...bySym].map(([k, v]) => `| ${k} | ${v.length} | ${f(sum(v.map((t) => t.net)))} | ${p(v.filter((t) => t.net > 0).length / v.length)} |`),
    ...(bySym.size ? [] : ['| — | 0 | — | — |']),
    '',
    '## מה כל סוכן עשה השבוע',
    ...snap.agents.map((a) => `- **${a.name} (${a.title})**: ${ev.filter((e) => e.agent === a.id).length} פעולות${a.errors ? `, ${a.errors} שגיאות מצטברות` : ''}`),
    `- סיגנלים: ${ev.filter((e) => e.type === 'signal').length} · אושרו: ${ev.filter((e) => e.type === 'approve').length} · נדחו: ${ev.filter((e) => e.type === 'reject').length}`,
    '',
    '## פוזיציות פתוחות',
    ...(snap.positions.length ? snap.positions.map((x) => `- ${x.symbol} ${x.side} ${x.qty} @${x.entry.toFixed(4)} · מינוף ${x.lev}x · רווח פתוח ${f(x.upnl)} · סטופ ${x.stop.toFixed(4)}`) : ['- אין']),
    '',
    '## האם לעבור לכסף אמיתי?',
    week.length < 20
      ? `- מוקדם מדי: ${week.length} עסקאות זה מדגם קטן מדי. צריך לפחות 4–6 שבועות ו-50+ עסקאות לפני החלטה.`
      : pf > 1.3 && mdd < 0.1
        ? '- התוצאות חיוביות במדגם — אם זה נשמר עוד 3–4 שבועות, אפשר לשקול כסף אמיתי בסכום קטן.'
        : '- התוצאות לא מספיק טובות עדיין — לא לעבור לכסף אמיתי.',
  ];
  return lines.join('\n') + '\n';
}
