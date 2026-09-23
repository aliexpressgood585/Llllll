import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Badge, EmptyState, SearchInput, Select, StatusBadge, useToast } from '../components/ui';
import { STAGES } from '../lib/constants';
import { stageOf } from '../lib/derive';
import { ago, daysSince, shortName, usd } from '../lib/format';
import { useNav } from '../lib/nav';
import { useOffice } from '../lib/store';
import type { Agent, TriageStage } from '../lib/types';
import { usePersisted } from '../lib/usePersisted';

const COLTONE: Record<TriageStage, string> = { new: 'bg-needs', in_progress: 'bg-review', waiting_agent: 'bg-idle', handled: 'bg-working' };

export function Board() {
  const { data, actions } = useOffice();
  const nav = useNav();
  const toast = useToast();
  const [f, setF] = usePersisted('board:filters', { q: '', project: '', status: '', hideHandled: false });
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TriageStage | null>(null);

  const items = useMemo(() => data.agents.filter((a) => ['needs_input', 'failed', 'review'].includes(a.status))
    .filter((a) => (!f.project || a.project === f.project) && (!f.status || a.status === f.status))
    .filter((a) => !f.q || `${a.name} ${a.needsAction ?? ''} ${a.detail ?? ''}`.toLowerCase().includes(f.q.toLowerCase())), [data.agents, f]);

  const move = async (a: Agent, stage: TriageStage) => {
    if (stageOf(data, a.id) === stage) return;
    try {
      const prev = await actions.setStage(a.id, stage);
      toast({ tone: 'success', text: `"${a.name}" הועבר ל"${STAGES.find((s) => s.id === stage)!.he}"`, undo: () => void actions.setStage(a.id, prev) });
    } catch (e) { toast({ tone: 'error', text: `ההעברה נכשלה: ${e instanceof Error ? e.message : e}` }); }
  };
  const cols = STAGES.filter((s) => !(f.hideHandled && s.id === 'handled'));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">לוח טיפול</h1>
          <p className="mt-1 text-sm text-ink-2">כל מה שסוכן צריך ממך — גרור כרטיס בין השלבים, או השתמש בתפריט "העבר ל" שבכרטיס.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card">
        <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="חיפוש בכרטיסים…" />
        <div className="w-44"><Select aria-label="סינון לפי פרויקט" value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}><option value="">כל הפרויקטים</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        <div className="w-40"><Select aria-label="סינון לפי מצב" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">כל המצבים</option><option value="needs_input">מחכה לך</option><option value="failed">נתקע</option><option value="review">מוכן לבדיקה</option></Select></div>
        <label className="flex cursor-pointer items-center gap-2 px-2 text-sm text-ink-2"><input type="checkbox" checked={f.hideHandled} onChange={(e) => setF({ ...f, hideHandled: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />הסתר טופלו</label>
        {(f.q || f.project || f.status) && <button type="button" className="text-sm text-primary hover:underline" onClick={() => setF({ ...f, q: '', project: '', status: '' })}>נקה סינון</button>}
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-2 scroll-thin">
        <div className="grid min-w-[880px] gap-3" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
          {cols.map((col) => {
            const list = items.filter((a) => stageOf(data, a.id) === col.id).sort((x, y) => String(x.updatedAt).localeCompare(String(y.updatedAt)));
            return (
              <section key={col.id} aria-label={`${col.he} — ${list.length} כרטיסים`}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(col.id); } }} onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
                onDrop={(e) => { e.preventDefault(); setOver(null); const a = data.agents.find((x) => x.id === dragId); setDragId(null); if (a) void move(a, col.id); }}
                className={`flex min-h-[420px] flex-col rounded-2xl border bg-surface-2/60 transition ${over === col.id ? 'border-primary bg-primary-soft/60' : 'border-line'}`}>
                <header className="flex items-center justify-between gap-2 px-3.5 py-3">
                  <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${COLTONE[col.id]}`} aria-hidden /><h2 className="text-sm font-semibold">{col.he}</h2><span className="tnum rounded-full bg-surface px-2 text-[12px] text-ink-2">{list.length}</span></div>
                  <span className="text-[12px] text-muted">{col.hint}</span>
                </header>
                <ul className="flex flex-1 flex-col gap-2.5 px-2.5 pb-3">
                  {list.map((a) => {
                    const proj = data.projects.find((p) => p.id === a.project);
                    const wait = daysSince(a.updatedAt);
                    return (
                      <li key={a.id} draggable onDragStart={(e) => { setDragId(a.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.id); }} onDragEnd={() => { setDragId(null); setOver(null); }}
                        className={`group rounded-xl border border-line bg-surface p-3 shadow-card transition hover:border-line-strong ${dragId === a.id ? 'opacity-50' : ''}`}>
                        <div className="flex items-start gap-2">
                          <Icon name="grip" size={16} className="mt-0.5 cursor-grab text-muted opacity-60 group-hover:opacity-100" />
                          <button type="button" onClick={() => nav.openAgent(a.id)} className="min-w-0 flex-1 text-start">
                            <span className="block text-sm font-semibold leading-snug hover:text-primary">{a.name}</span>
                            <span className="mt-1 flex items-center gap-1.5 text-[12px] text-muted"><Avatar name={shortName(proj?.name ?? a.project)} size={16} />{shortName(proj?.name ?? a.project)}</span>
                          </button>
                        </div>
                        {(a.needsAction || a.detail) && <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-ink-2">{a.needsAction ?? a.detail}</p>}
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={a.status} short />
                          <Badge tone={wait > data.settings.maxWaitDays ? 'failed' : 'neutral'} icon="clock">{ago(a.updatedAt)}</Badge>
                          {a.costUsd !== undefined && <Badge>{usd(a.costUsd)}</Badge>}
                        </div>
                        <label className="mt-2.5 flex items-center gap-2 text-[12px] text-muted">
                          העבר ל
                          <select value={stageOf(data, a.id)} onChange={(e) => void move(a, e.target.value as TriageStage)} aria-label={`העבר את "${a.name}" לשלב`}
                            className="h-7 flex-1 rounded-md border border-line bg-surface px-1.5 text-[12px] text-ink">
                            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.he}</option>)}
                          </select>
                        </label>
                      </li>
                    );
                  })}
                  {!list.length && (
                    <li className="grid flex-1 place-items-center rounded-xl border border-dashed border-line-strong/60 p-4 text-center text-[12.5px] text-muted">
                      {col.id === 'new' ? 'אין פריטים חדשים — מעולה' : col.id === 'handled' ? 'גרור לכאן מה שסגרת' : 'גרור לכאן כרטיס'}
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      {!items.length && <EmptyState icon="check" title="אין פריטים שדורשים טיפול" text="כשסוכן יחכה לך, ייתקע או יסיים עבודה לבדיקה — הוא יופיע כאן." />}
    </div>
  );
}
