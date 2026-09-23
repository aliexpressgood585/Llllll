import { useEffect, useMemo, useRef, useState } from 'react';
import { PRIORITY, STAGES } from '../lib/constants';
import { stageOf, taskBuckets, waitingOnYou } from '../lib/derive';
import { ago, dueLabel, shortName, todayISO, usd } from '../lib/format';
import { SCREENS, useNav } from '../lib/nav';
import { useOffice } from '../lib/store';
import type { Priority, Task, TriageStage } from '../lib/types';
import { Icon } from './Icon';
import { Badge, Button, Dialog, Drawer, EmptyState, Field, Kbd, PriorityBadge, Segmented, Select, StatusBadge, TextArea, TextInput, useConfirm, useToast } from './ui';

/* ================= task editor ================= */
export function TaskEditor({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Partial<Task> & { id?: string } }) {
  const { data, actions } = useOffice();
  const toast = useToast();
  const editing = !!initial?.id;
  const [f, setF] = useState({ title: '', project: '', agentId: '', priority: 'medium' as Priority, due: todayISO(1), remind: true });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({ title: initial?.title ?? '', project: initial?.project ?? '', agentId: initial?.agentId ?? '', priority: initial?.priority ?? 'medium', due: initial?.due ?? todayISO(1), remind: initial?.remind ?? true });
    setTouched({});
  }, [open, initial]);
  const errors = {
    title: f.title.trim().length < 3 ? 'כתוב לפחות 3 תווים — מה צריך לעשות?' : f.title.length > 140 ? 'עד 140 תווים' : '',
    due: f.due && !/^\d{4}-\d{2}-\d{2}$/.test(f.due) ? 'תאריך לא תקין' : '',
  };
  const agents = data.agents.filter((a) => !f.project || a.project === f.project);
  const valid = !errors.title && !errors.due;
  const submit = async () => {
    setTouched({ title: true, due: true });
    if (!valid) return;
    setSaving(true);
    try {
      const payload = { title: f.title.trim(), project: f.project || undefined, agentId: f.agentId || undefined, priority: f.priority, due: f.due || undefined, remind: f.remind };
      if (editing) { await actions.updateTask(initial!.id!, payload); toast({ tone: 'success', text: 'המשימה עודכנה' }); }
      else { await actions.addTask({ ...payload, source: 'manual' }); toast({ tone: 'success', text: 'המשימה נוספה' }); }
      onClose();
    } catch (e) {
      toast({ tone: 'error', text: `השמירה נכשלה: ${e instanceof Error ? e.message : e}` });
    } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={editing ? 'עריכת משימה' : 'משימה חדשה'}
      footer={<><Button onClick={onClose}>ביטול</Button><Button variant="primary" icon="check" loading={saving} onClick={submit}>{editing ? 'שמור שינויים' : 'צור משימה'}</Button></>}>
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="מה צריך לעשות?" htmlFor="t-title" error={touched.title ? errors.title : ''}>
          <TextInput id="t-title" data-autofocus value={f.title} invalid={!!(touched.title && errors.title)} placeholder="לדוגמה: לשלוח צילומי מסך מ-Search Console"
            onChange={(e) => setF({ ...f, title: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, title: true }))} maxLength={160} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="פרויקט" htmlFor="t-project">
            <Select id="t-project" value={f.project} onChange={(e) => setF({ ...f, project: e.target.value, agentId: '' })}>
              <option value="">ללא פרויקט</option>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="סוכן קשור" htmlFor="t-agent" hint={agents.length ? undefined : 'אין סוכנים בפרויקט הזה'}>
            <Select id="t-agent" value={f.agentId} onChange={(e) => setF({ ...f, agentId: e.target.value })} disabled={!agents.length}>
              <option value="">ללא</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="תאריך יעד" htmlFor="t-due" error={touched.due ? errors.due : ''} hint={f.due && f.due < todayISO() ? 'שים לב: התאריך כבר עבר' : undefined}>
            <TextInput id="t-due" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} className="ltr text-start" />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">עדיפות</span>
            <Segmented label="עדיפות" value={f.priority} onChange={(v) => setF({ ...f, priority: v })} options={(['high', 'medium', 'low'] as Priority[]).map((p) => ({ value: p, label: PRIORITY[p].he }))} />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={f.remind} onChange={(e) => setF({ ...f, remind: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
          להזכיר לי בפעמון ההתראות ביום היעד
        </label>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/* ================= quick add ================= */
export function QuickAdd({ open, onClose, kind, onTask }: { open: boolean; onClose: () => void; kind: 'task' | 'note' | 'project'; onTask: () => void }) {
  const { data, actions } = useOffice();
  const toast = useToast();
  const [k, setK] = useState(kind);
  const [project, setProject] = useState('');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [repo, setRepo] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setK(kind); setTouched(false); setText(''); setName(''); setRepo(''); } }, [open, kind]);
  useEffect(() => { if (open && k === 'task') { onClose(); onTask(); } }, [open, k, onClose, onTask]);
  const noteErr = !project ? 'בחר פרויקט' : text.trim().length < 2 ? 'כתוב את ההערה' : '';
  const repoOk = /^[\w.-]+\/[\w.-]+$/.test(repo.trim());
  const projErr = name.trim().length < 2 ? 'תן שם לפרויקט' : !repoOk ? 'כתובת ריפו בפורמט owner/name' : data.projects.some((p) => p.repo === repo.trim()) ? 'הריפו הזה כבר קיים במשרד' : '';
  const submit = async () => {
    setTouched(true);
    const err = k === 'note' ? noteErr : projErr;
    if (err) return;
    setSaving(true);
    try {
      if (k === 'note') { await actions.addNote(project, text.trim()); toast({ tone: 'success', text: 'ההערה נשמרה' }); }
      else { await actions.addProject({ name: name.trim(), repo: repo.trim() }); toast({ tone: 'success', text: `הפרויקט "${name.trim()}" נוסף — הוא ייכנס לעליית הגג עד שסוכן יתחיל לעבוד עליו` }); }
      onClose();
    } catch (e) { toast({ tone: 'error', text: `השמירה נכשלה: ${e instanceof Error ? e.message : e}` }); } finally { setSaving(false); }
  };
  if (k === 'task') return null;
  return (
    <Dialog open={open} onClose={onClose} title="הוספה מהירה"
      footer={<><Button onClick={onClose}>ביטול</Button><Button variant="primary" icon="plus" loading={saving} onClick={submit}>{k === 'note' ? 'שמור הערה' : 'הוסף פרויקט'}</Button></>}>
      <div className="grid gap-4">
        <Segmented label="סוג" value={k} onChange={setK} options={[{ value: 'task', label: 'משימה' }, { value: 'note', label: 'הערה לפרויקט' }, { value: 'project', label: 'פרויקט חדש' }]} />
        {k === 'note' ? (
          <>
            <Field label="פרויקט" htmlFor="n-project" error={touched && !project ? 'בחר פרויקט' : ''}>
              <Select id="n-project" value={project} onChange={(e) => setProject(e.target.value)}>
                <option value="">בחר פרויקט…</option>
                {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="הערה" htmlFor="n-text" error={touched && project && text.trim().length < 2 ? 'כתוב את ההערה' : ''}>
              <TextArea id="n-text" data-autofocus value={text} onChange={(e) => setText(e.target.value)} placeholder="החלטה, תזכורת או הקשר שכדאי לזכור על הפרויקט" maxLength={1000} />
            </Field>
          </>
        ) : (
          <>
            <Field label="שם הפרויקט" htmlFor="p-name" error={touched && name.trim().length < 2 ? 'תן שם לפרויקט' : ''}>
              <TextInput id="p-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="לדוגמה: אפליקציית הזמנות" />
            </Field>
            <Field label="ריפו ב-GitHub" htmlFor="p-repo" error={touched ? (projErr && name.trim().length >= 2 ? projErr : '') : ''} hint="בפורמט owner/name">
              <TextInput id="p-repo" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="aliexpressgood585/new-app" className="ltr text-start" />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  );
}

/* ================= agent drawer ================= */
export function AgentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, actions } = useOffice();
  const nav = useNav();
  const toast = useToast();
  const a = data.agents.find((x) => x.id === id);
  const project = data.projects.find((p) => p.id === a?.project);
  const tasks = data.tasks.filter((t) => t.agentId === id);
  if (!a) return null;
  const stage = stageOf(data, a.id);
  const setStage = async (s: TriageStage) => {
    try {
      const prev = await actions.setStage(a.id, s);
      toast({ tone: 'success', text: `הועבר ל"${STAGES.find((x) => x.id === s)!.he}"`, undo: () => void actions.setStage(a.id, prev) });
    } catch (e) { toast({ tone: 'error', text: `לא נשמר: ${e instanceof Error ? e.message : e}` }); }
  };
  return (
    <Drawer open={!!a} onClose={onClose} title={a.name}
      subtitle={<span className="inline-flex flex-wrap items-center gap-2"><StatusBadge status={a.status} /><button className="text-primary hover:underline" onClick={() => { onClose(); nav.go({ screen: 'project', id: a.project }); }}>{project?.name ?? a.project}</button><span>· {ago(a.updatedAt)}</span></span>}>
      <div className="grid gap-5">
        {a.needsAction && (
          <div className="rounded-xl border border-needs/30 bg-needs-soft p-3.5">
            <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-needs"><Icon name="hand" size={15} />מה צריך ממך</div>
            <p className="text-sm leading-relaxed text-ink">{a.needsAction}</p>
          </div>
        )}
        {a.detail && (
          <section>
            <h3 className="mb-1.5 text-[13px] font-semibold text-muted">מה קורה</h3>
            <p className="text-sm leading-relaxed text-ink">{a.detail}</p>
          </section>
        )}
        {['needs_input', 'failed', 'review'].includes(a.status) && (
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-muted">שלב הטיפול שלך</h3>
            <Segmented label="שלב טיפול" value={stage} onChange={setStage} options={STAGES.map((s) => ({ value: s.id, label: s.he }))} />
          </section>
        )}
        <div className="flex flex-wrap gap-2">
          {a.url && <a href={a.url} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-ink shadow-card hover:brightness-110"><Icon name="external" size={16} />פתח את הסשן</a>}
          <Button icon="plus" onClick={() => nav.editTask({ title: a.needsAction ?? '', project: a.project, agentId: a.id, priority: a.status === 'failed' || a.status === 'needs_input' ? 'high' : 'medium' })}>צור משימה מזה</Button>
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3.5 text-[13px]">
          <div><dt className="text-muted">מודל</dt><dd className="ltr mt-0.5 text-start font-medium">{a.model ?? '—'}</dd></div>
          <div><dt className="text-muted">עלות מצטברת</dt><dd className="tnum mt-0.5 font-medium">{a.costUsd !== undefined ? usd(a.costUsd, 2) : 'לא ידוע'}</dd></div>
          <div><dt className="text-muted">פעילות אחרונה</dt><dd className="mt-0.5 font-medium">{new Date(a.updatedAt).toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
          <div><dt className="text-muted">ריפו</dt><dd className="ltr mt-0.5 truncate text-start font-medium">{project?.repo ?? '—'}</dd></div>
        </dl>
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">מסמכים שהסוכן יצר</h3>
          {a.artifacts?.length ? (
            <ul className="grid gap-1.5">{a.artifacts.map((d) => <li key={d.url}><a href={d.url} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2"><Icon name="file" size={16} className="text-muted" /><span className="flex-1 truncate">{d.title}</span><Icon name="external" size={14} className="text-muted" /></a></li>)}</ul>
          ) : <p className="text-[13px] text-muted">הסוכן הזה לא פרסם מסמכים.</p>}
        </section>
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">משימות קשורות</h3>
          {tasks.length ? <TaskMiniList tasks={tasks} /> : <p className="text-[13px] text-muted">אין משימות. אפשר ליצור אחת מהכפתור למעלה.</p>}
        </section>
      </div>
    </Drawer>
  );
}

/* ================= compact task list (reused) ================= */
export function TaskMiniList({ tasks, showProject }: { tasks: Task[]; showProject?: boolean }) {
  const { data, actions } = useOffice();
  const toast = useToast();
  const nav = useNav();
  const toggle = async (t: Task) => {
    try {
      await actions.updateTask(t.id, { done: !t.done });
      toast({ tone: 'success', text: t.done ? 'המשימה נפתחה מחדש' : 'כל הכבוד — המשימה הושלמה', undo: () => void actions.updateTask(t.id, { done: t.done }) });
    } catch (e) { toast({ tone: 'error', text: `לא נשמר: ${e instanceof Error ? e.message : e}` }); }
  };
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {tasks.map((t) => {
        const due = dueLabel(t.due);
        return (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
            <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={`סמן "${t.title}" כהושלמה`} className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--working)]" />
            <button type="button" onClick={() => nav.editTask(t)} className={`min-w-0 flex-1 text-start text-sm hover:text-primary ${t.done ? 'text-muted line-through' : 'text-ink'}`}>
              <span className="line-clamp-2">{t.title}</span>
              {showProject && t.project && <span className="mt-0.5 block text-[12px] text-muted">{shortName(data.projects.find((p) => p.id === t.project)?.name ?? '')}</span>}
            </button>
            {!t.done && <span className={`shrink-0 text-[12px] ${due.tone === 'overdue' ? 'font-medium text-failed' : due.tone === 'today' ? 'font-medium text-needs' : 'text-muted'}`}>{due.text}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/* ================= command palette ================= */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useOffice();
  const nav = useNav();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => { if (open) { setQ(''); setI(0); } }, [open]);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const m = (t?: string) => !s || (t ?? '').toLowerCase().includes(s);
    const out: { group: string; label: string; hint?: string; icon: string; run: () => void }[] = [];
    out.push({ group: 'פעולות', label: 'משימה חדשה', icon: 'plus', hint: 'N', run: () => nav.editTask() });
    out.push({ group: 'פעולות', label: 'הערה לפרויקט', icon: 'note', run: () => nav.quickAdd('note') });
    out.push({ group: 'פעולות', label: 'פרויקט חדש', icon: 'folder', run: () => nav.quickAdd('project') });
    for (const sc of SCREENS) out.push({ group: 'מסכים', label: sc.label, icon: sc.icon, hint: `Alt+${sc.key}`, run: () => nav.go({ screen: sc.id }) });
    for (const p of data.projects) out.push({ group: 'פרויקטים', label: p.name, hint: p.repo, icon: 'folder', run: () => nav.go({ screen: 'project', id: p.id }) });
    for (const a of data.agents) out.push({ group: 'סוכנים', label: a.name, hint: shortName(data.projects.find((p) => p.id === a.project)?.name ?? ''), icon: 'agent', run: () => nav.openAgent(a.id) });
    for (const t of data.tasks.filter((x) => !x.done)) out.push({ group: 'משימות', label: t.title, hint: dueLabel(t.due).text, icon: 'tasks', run: () => nav.editTask(t) });
    for (const a of data.agents) for (const d of a.artifacts ?? []) out.push({ group: 'מסמכים', label: d.title, hint: a.name, icon: 'file', run: () => window.open(d.url, '_blank', 'noopener') });
    return out.filter((o) => m(o.label) || m(o.hint)).slice(0, 40);
  }, [q, data, nav]);
  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' }); }, [i]);
  const run = (k: number) => { const it = items[k]; if (!it) return; onClose(); setTimeout(it.run, 0); };
  let lastGroup = '';
  return (
    <Dialog open={open} onClose={onClose} title="חיפוש ופעולות" width={620}>
      <div className="grid gap-3">
        <div className="relative">
          <Icon name="search" size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="חפש פרויקט, סוכן, משימה, מסמך או פעולה…" aria-label="חיפוש גלובלי"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={`pi-${i}`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); run(i); }
            }}
            className="h-12 w-full rounded-xl border border-line bg-surface-2 pe-3 ps-10 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-[var(--focus)]/40" />
        </div>
        {items.length ? (
          <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto scroll-thin">
            {items.map((it, k) => {
              const head = it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              return (
                <li key={k} role="presentation">
                  {head && <div className="px-2 pb-1 pt-3 text-[11.5px] font-semibold text-muted">{head}</div>}
                  <button type="button" id={`pi-${k}`} data-i={k} role="option" aria-selected={k === i} onMouseMove={() => setI(k)} onClick={() => run(k)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start text-sm ${k === i ? 'bg-primary-soft text-ink' : 'text-ink-2'}`}>
                    <Icon name={it.icon} size={16} className="text-muted" />
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.hint && <span className="max-w-[40%] truncate text-[12px] text-muted">{it.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState icon="search" title="לא נמצא דבר" text="נסה מילה אחרת — אפשר לחפש לפי שם פרויקט, סוכן, משימה או מסמך." />}
        <div className="flex flex-wrap gap-3 border-t border-line pt-2 text-[12px] text-muted"><span><Kbd>↑</Kbd> <Kbd>↓</Kbd> ניווט</span><span><Kbd>Enter</Kbd> פתיחה</span><span><Kbd>Esc</Kbd> סגירה</span></div>
      </div>
    </Dialog>
  );
}

/* ================= notifications ================= */
export function useNotifications() {
  const { data } = useOffice();
  return useMemo(() => {
    const b = taskBuckets(data.tasks);
    const items = [
      ...b.overdue.map((t) => ({ key: `t${t.id}`, icon: 'clock', tone: 'failed', text: `באיחור: ${t.title}`, sub: dueLabel(t.due).text, task: t })),
      ...b.today.filter((t) => t.remind !== false).map((t) => ({ key: `t${t.id}`, icon: 'bell', tone: 'needs', text: `היום: ${t.title}`, sub: t.project ? shortName(data.projects.find((p) => p.id === t.project)?.name ?? '') : '', task: t })),
      ...waitingOnYou(data).filter((a) => stageOf(data, a.id) === 'new').map((a) => ({ key: `a${a.id}`, icon: 'hand', tone: 'needs', text: `${a.name} מחכה לך`, sub: `${shortName(data.projects.find((p) => p.id === a.project)?.name ?? '')} · ${ago(a.updatedAt)}`, agent: a.id })),
    ];
    return items as ({ key: string; icon: string; tone: string; text: string; sub: string; task?: Task; agent?: string })[];
  }, [data]);
}

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const items = useNotifications();
  const nav = useNav();
  return (
    <div className="pop-in absolute left-0 top-12 z-40 w-[min(380px,calc(100vw-24px))] rounded-2xl border border-line bg-surface shadow-pop" role="dialog" aria-label="התראות">
      <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">התראות</h2><Badge>{items.length}</Badge></div>
      {items.length ? (
        <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto scroll-thin">
          {items.map((n) => (
            <li key={n.key}>
              <button type="button" className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-surface-2"
                onClick={() => { onClose(); if (n.task) nav.editTask(n.task); else if (n.agent) nav.openAgent(n.agent); }}>
                <span className={`mt-0.5 ${n.tone === 'failed' ? 'text-failed' : 'text-needs'}`}><Icon name={n.icon} size={16} /></span>
                <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm text-ink">{n.text}</span>{n.sub && <span className="mt-0.5 block text-[12px] text-muted">{n.sub}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon="check" title="אין התראות" text="אין משימות באיחור ואין סוכנים חדשים שמחכים לך." />}
    </div>
  );
}

/* ================= delete helpers with confirm + undo ================= */
export function useDeleteTask() {
  const { actions } = useOffice();
  const confirm = useConfirm();
  const toast = useToast();
  return async (t: Task) => {
    if (!(await confirm({ title: 'למחוק את המשימה?', text: `"${t.title}" תימחק. אפשר לבטל מיד אחרי המחיקה.`, confirm: 'מחק', danger: true }))) return false;
    try {
      const removed = await actions.deleteTask(t.id);
      toast({ tone: 'success', text: 'המשימה נמחקה', undo: removed ? () => actions.restoreTask(removed) : undefined });
      return true;
    } catch (e) { toast({ tone: 'error', text: `המחיקה נכשלה: ${e instanceof Error ? e.message : e}` }); return false; }
  };
}

export { PriorityBadge };
