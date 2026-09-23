const DAY = 86400000;

export function ago(iso?: string): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  if (ms < 0) return 'עכשיו';
  const m = Math.round(ms / 60000);
  if (m < 60) return m <= 1 ? 'עכשיו' : `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  if (d === 1) return 'אתמול';
  if (d < 60) return `לפני ${d} ימים`;
  return `לפני ${Math.round(d / 30)} חודשים`;
}

export const daysSince = (iso?: string) => (iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / DAY) : 0);

export const usd = (v: number, dp = 0) => `$${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const num = (v: number) => v.toLocaleString('he-IL');
export const pct = (v: number) => `${Math.round(v * 100)}%`;

export function todayISO(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateHe(iso?: string, withWeekday = false): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', ...(withWeekday ? { weekday: 'short' } : {}) });
}

export function dueLabel(due?: string): { text: string; tone: 'overdue' | 'today' | 'soon' | 'later' | 'none' } {
  if (!due) return { text: 'ללא תאריך', tone: 'none' };
  const t = todayISO();
  if (due < t) return { text: `באיחור · ${dateHe(due)}`, tone: 'overdue' };
  if (due === t) return { text: 'היום', tone: 'today' };
  if (due === todayISO(1)) return { text: 'מחר', tone: 'soon' };
  if (due <= todayISO(7)) return { text: dateHe(due, true), tone: 'soon' };
  return { text: dateHe(due), tone: 'later' };
}

export const shortName = (n: string) => String(n).split(' — ')[0];
export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
