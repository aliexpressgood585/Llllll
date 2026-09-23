import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { useDeleteTask } from '../components/overlays';
import { Badge, Button, Card, EmptyState, IconButton, PriorityBadge, SearchInput, Segmented, Select, useToast } from '../components/ui';
import { PRIORITY } from '../lib/constants';
import { dueLabel, shortName, todayISO } from '../lib/format';
import { useNav } from '../lib/nav';
import { useOffice } from '../lib/store';
import type { Task } from '../lib/types';
import { usePersisted } from '../lib/usePersisted';

type Range = 'today' | 'week' | 'month' | 'all' | 'overdue' | 'done';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function Tasks() {
  const { data } = useOffice();
  const [view, setView] = usePersisted<'list' | 'calendar'>('tasks:view', 'list');
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">משימות ולוח שנה</h1>
          <p className="mt-1 text-sm text-ink-2">{data.tasks.filter((t) => !t.done).length} משימות פתוחות · תזכורות מופיעות בפעמון ביום היעד</p>
        </div>
        <Segmented label="תצוגה" value={view} onChange={setView} options={[{ value: 'list', label: 'רשימה' }, { value: 'calendar', label: 'לוח שנה' }]} />
      </div>
      {view === 'list' ? <TaskList /> : <Calendar />}
    </div>
  );
}

function TaskList() {
  const { data, actions } = useOffice();
  const nav = useNav();
  const toast = useToast();
  const del = useDeleteTask();
  const [f, setF] = usePersisted('tasks:filters', { range: 'week' as Range, q: '', project: '', priority: '', sort: 'due' });
  const t0 = todayISO();
  const counts: Record<Range, number> = {
    today: data.tasks.filter((t) => !t.done && t.due && t.due <= t0).length,
    week: data.tasks.filter((t) => !t.done && t.due && t.due <= todayISO(7)).length,
    month: data.tasks.filter((t) => !t.done && t.due && t.due <= todayISO(31)).length,
    all: data.tasks.filter((t) => !t.done).length,
    overdue: data.tasks.filter((t) => !t.done && t.due && t.due < t0).length,
    done: data.tasks.filter((t) => t.done).length,
  };
  const list = useMemo(() => {
    let l = data.tasks.filter((t) => {
      if (f.range === 'done') return t.done;
      if (t.done) return false;
      if (f.range === 'today') return !!t.due && t.due <= t0;
      if (f.range === 'week') return !!t.due && t.due <= todayISO(7);
      if (f.range === 'month') return !!t.due && t.due <= todayISO(31);
      if (f.range === 'overdue') return !!t.due && t.due < t0;
      return true;
    });
    if (f.project) l = l.filter((t) => t.project === f.project);
    if (f.priority) l = l.filter((t) => t.priority === f.priority);
    if (f.q) l = l.filter((t) => t.title.toLowerCase().includes(f.q.toLowerCase()));
    const by: Record<string, (a: Task, b: Task) => number> = {
      due: (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || PRIORITY[a.priority].rank - PRIORITY[b.priority].rank,
      priority: (a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || (a.due ?? '9999').localeCompare(b.due ?? '9999'),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
    };
    return l.sort(by[f.sort] ?? by.due);
  }, [data.tasks, f, t0]);

  const toggle = async (t: Task) => {
    try {
      await actions.updateTask(t.id, { done: !t.done });
      toast({ tone: 'success', text: t.done ? 'המשימה נפתחה מחדש' : 'המשימה הושלמה', undo: () => void actions.updateTask(t.id, { done: t.done }) });
    } catch (e) { toast({ tone: 'error', text: `לא נשמר: ${e instanceof Error ? e.message : e}` }); }
  };

  return (
    <Card>
      <div className="grid gap-3 border-b border-line p-4">
        <Segmented label="טווח" value={f.range} onChange={(range) => setF({ ...f, range })} options={[
          { value: 'today' as Range, label: 'היום', count: counts.today }, { value: 'week' as Range, label: 'השבוע', count: counts.week }, { value: 'month' as Range, label: 'החודש', count: counts.month },
          { value: 'all' as Range, label: 'כל הפתוחות', count: counts.all }, { value: 'overdue' as Range, label: 'באיחור', count: counts.overdue }, { value: 'done' as Range, label: 'הושלמו', count: counts.done }]} />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="חיפוש משימה…" />
          <div className="w-44"><Select aria-label="פרויקט" value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}><option value="">כל הפרויקטים</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
          <div className="w-36"><Select aria-label="עדיפות" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">כל העדיפויות</option><option value="high">גבוהה</option><option value="medium">בינונית</option><option value="low">נמוכה</option></Select></div>
          <div className="w-40"><Select aria-label="מיון" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}><option value="due">מיון: תאריך יעד</option><option value="priority">מיון: עדיפות</option><option value="created">מיון: חדשות קודם</option></Select></div>
          <Button variant="primary" icon="plus" onClick={() => nav.editTask({ project: f.project || undefined })}>משימה חדשה</Button>
        </div>
      </div>
      {list.length ? (
        <ul className="divide-y divide-line">
          {list.map((t) => {
            const due = dueLabel(t.due);
            const agent = data.agents.find((a) => a.id === t.agentId);
            const proj = data.projects.find((p) => p.id === t.project);
            return (
              <li key={t.id} className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-surface-2/60">
                <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={`סמן "${t.title}" כהושלמה`} className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--working)]" />
                <button type="button" onClick={() => nav.editTask(t)} className={`min-w-[200px] flex-1 text-start text-[14px] ${t.done ? 'text-muted line-through' : 'text-ink'} hover:text-primary`}>{t.title}</button>
                <div className="flex flex-wrap items-center gap-1.5">
                  {proj && <button type="button" onClick={() => nav.go({ screen: 'project', id: proj.id })}><Badge tone="primary" icon="folder">{shortName(proj.name)}</Badge></button>}
                  {agent && <button type="button" onClick={() => nav.openAgent(agent.id)}><Badge icon="agent">{agent.name}</Badge></button>}
                  <PriorityBadge p={t.priority} />
                  {!t.done && <Badge tone={due.tone === 'overdue' ? 'failed' : due.tone === 'today' ? 'needs' : 'neutral'} icon="calendar">{due.text}</Badge>}
                  {t.source === 'agent' && <Badge tone="accent" icon="hand">מסוכן</Badge>}
                </div>
                <div className="flex items-center opacity-70 transition group-hover:opacity-100">
                  <IconButton icon="edit" label="עריכה" onClick={() => nav.editTask(t)} />
                  <IconButton icon="trash" label="מחיקה" onClick={() => void del(t)} className="hover:text-failed" />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={f.range === 'overdue' ? 'check' : 'tasks'} title={f.range === 'overdue' ? 'אין משימות באיחור' : 'אין משימות בתצוגה הזו'}
          text={f.q || f.project || f.priority ? 'נסה לנקות את הסינון.' : 'צור משימה חדשה, או הפוך פריט מסוכן למשימה מתוך לוח הטיפול.'}
          action={f.q || f.project || f.priority ? <Button onClick={() => setF({ ...f, q: '', project: '', priority: '' })}>נקה סינון</Button> : <Button variant="primary" icon="plus" onClick={() => nav.editTask()}>משימה חדשה</Button>} />
      )}
    </Card>
  );
}

function Calendar() {
  const { data } = useOffice();
  const nav = useNav();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState<string>(todayISO());
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const byDay = useMemo(() => {
    const m = new Map<string, { tasks: Task[]; agents: number; follow: string[] }>();
    const get = (k: string) => m.get(k) ?? (m.set(k, { tasks: [], agents: 0, follow: [] }), m.get(k)!);
    for (const t of data.tasks) if (t.due) get(t.due).tasks.push(t);
    for (const a of data.agents) get(iso(new Date(a.updatedAt))).agents++;
    for (const [id, pm] of Object.entries(data.pmeta)) if (pm.followUp) get(pm.followUp).follow.push(id);
    return m;
  }, [data]);
  const sel = byDay.get(day);
  const t0 = todayISO();
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">{cursor.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</h2>
          <div className="flex items-center gap-1">
            <IconButton icon="chevronRight" label="החודש הקודם" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} />
            <Button size="sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setDay(todayISO()); }}>היום</Button>
            <IconButton icon="chevronLeft" label="החודש הבא" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} />
          </div>
        </header>
        <div className="grid grid-cols-7 border-b border-line text-center text-[12px] font-medium text-muted">
          {['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label="לוח שנה חודשי">
          {cells.map((d) => {
            const k = iso(d);
            const e = byDay.get(k);
            const inMonth = d.getMonth() === cursor.getMonth();
            const open = e?.tasks.filter((t) => !t.done) ?? [];
            return (
              <button type="button" key={k} role="gridcell" aria-selected={k === day} onClick={() => setDay(k)}
                aria-label={`${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}: ${open.length} משימות, ${e?.agents ?? 0} פעילויות סוכנים`}
                className={`min-h-[92px] border-b border-s border-line p-1.5 text-start align-top transition hover:bg-surface-2 ${inMonth ? '' : 'bg-surface-2/40 text-muted'} ${k === day ? 'bg-primary-soft/60 ring-2 ring-inset ring-primary/40' : ''}`}>
                <span className={`tnum inline-grid h-6 w-6 place-items-center rounded-full text-[12.5px] ${k === t0 ? 'bg-primary font-bold text-primary-ink' : ''}`}>{d.getDate()}</span>
                <span className="mt-1 grid gap-0.5">
                  {open.slice(0, 2).map((t) => (
                    <span key={t.id} className={`truncate rounded px-1 text-[11px] leading-5 ${t.due! < t0 ? 'bg-failed-soft text-failed' : t.priority === 'high' ? 'bg-needs-soft text-needs' : 'bg-surface-3 text-ink-2'}`}>{t.title}</span>
                  ))}
                  {open.length > 2 && <span className="text-[11px] text-muted">+{open.length - 2} נוספות</span>}
                  {!!e?.follow.length && <span className="truncate rounded bg-review-soft px-1 text-[11px] leading-5 text-review">מעקב · {e.follow.length}</span>}
                  {!!e?.agents && <span className="inline-flex items-center gap-1 text-[11px] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-working" />{e.agents} סוכנים</span>}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
      <Card>
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">{new Date(`${day}T12:00:00`).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <Button size="sm" variant="primary" icon="plus" onClick={() => nav.editTask({ due: day })}>משימה</Button>
        </header>
        <div className="grid gap-4 p-4">
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-muted">משימות</h3>
            {sel?.tasks.length ? (
              <ul className="grid gap-1.5">
                {sel.tasks.map((t) => (
                  <li key={t.id}><button type="button" onClick={() => nav.editTask(t)} className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-start text-sm hover:bg-surface-2">
                    <Icon name={t.done ? 'check' : 'tasks'} size={15} className={t.done ? 'text-working' : 'text-muted'} /><span className={`flex-1 ${t.done ? 'text-muted line-through' : ''}`}>{t.title}</span><PriorityBadge p={t.priority} />
                  </button></li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-muted">אין משימות ביום הזה.</p>}
          </section>
          {!!sel?.follow.length && (
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-muted">מעקבי פרויקטים</h3>
              <ul className="grid gap-1.5">{sel.follow.map((id) => <li key={id}><button type="button" className="w-full rounded-lg border border-line px-3 py-2 text-start text-sm hover:bg-surface-2" onClick={() => nav.go({ screen: 'project', id })}>{data.projects.find((p) => p.id === id)?.name ?? id}</button></li>)}</ul>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-muted">פעילות סוכנים</h3>
            {data.agents.filter((a) => iso(new Date(a.updatedAt)) === day).length ? (
              <ul className="grid gap-1.5">{data.agents.filter((a) => iso(new Date(a.updatedAt)) === day).map((a) => <li key={a.id}><button type="button" className="w-full rounded-lg border border-line px-3 py-2 text-start text-sm hover:bg-surface-2" onClick={() => nav.openAgent(a.id)}>{a.name}</button></li>)}</ul>
            ) : <p className="text-[13px] text-muted">אין עדכוני סוכנים ביום הזה.</p>}
          </section>
        </div>
      </Card>
    </div>
  );
}
