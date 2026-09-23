const HOUR = 3600e3;
const DAY = 24 * HOUR;
export const YEAR_MS = 365 * DAY;

function at0800(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8, 0, 0);
}

function lastFridayOfMonth(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0, 8, 0, 0));
  const back = (last.getUTCDay() - 5 + 7) % 7;
  return last.getTime() - back * DAY;
}

/**
 * Binance/Deribit style listing: 3 dailies, up to 3 weeklies (Fri), 2 monthlies (last Fri) — all 08:00 UTC.
 * Pure function of time so positions and the chain always agree on the listing.
 */
export function listExpiries(now: number): number[] {
  const out = new Set<number>();
  let d = at0800(now);
  if (d <= now + 5 * 60e3) d += DAY;
  for (let i = 0; i < 3; i++) out.add(d + i * DAY);

  let fri = at0800(now);
  while (new Date(fri).getUTCDay() !== 5 || fri <= now + 5 * 60e3) fri += DAY;
  let weeklies = 0;
  while (weeklies < 3) {
    if (!out.has(fri)) {
      out.add(fri);
      weeklies++;
    }
    fri += 7 * DAY;
  }
  const n = new Date(now);
  let months = 0;
  for (let m = 0; months < 2 && m < 4; m++) {
    const lf = lastFridayOfMonth(n.getUTCFullYear(), n.getUTCMonth() + m);
    if (lf > now + 10 * DAY && !out.has(lf)) {
      out.add(lf);
      months++;
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function yearsTo(expiry: number, now: number): number {
  return Math.max(0, (expiry - now) / YEAR_MS);
}

export function dteLabel(expiry: number, now: number): string {
  const days = (expiry - now) / DAY;
  if (days < 1) return '0D';
  return `${Math.round(days)}D`;
}

export const MS = { HOUR, DAY };
