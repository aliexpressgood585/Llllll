import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { TaskMiniList } from '../components/overlays';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, SearchInput, Select, StatusBadge, Tabs, TextArea, TextInput, useConfirm, useToast } from '../components/ui';
import { STATUS, STATUS_PRIORITY } from '../lib/constants';
import { projectViews, type ProjectView } from '../lib/derive';
import { ago, dateHe, dueLabel, shortName, todayISO, usd } from '../lib/format';
import { useNav } from '../lib/nav';
import { useOffice } from '../lib/store';
import type { ProjectStatus } from '../lib/types';
import { usePersisted } from '../lib/usePersisted';

const ORDER: ProjectStatus[] = [...STATUS_PRIORITY, 'idle'];

export function Projects() {
  const { data } = useOffice();
  const nav = useNav();
  const [f, setF] = usePersisted('projects:filters', { q: '', status: '', sort: 'attention' });
  const views = useMemo(() => projectViews(data), [data]);
  const list = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const out = views.filter((v) => (!f.status || v.status === f.status) && (!q || `${v.project.name} ${v.project.repo} ${v.agents.map((a) => a.name).join(' ')}`.toLowerCase().includes(q)));
    const by: Record<string, (a: ProjectView, b: ProjectView) => number> = {
      attention: (a, b) => b.attention - a.attention || ORDER.indexOf(a.status) - ORDER.indexOf(b.status),
      recent: (a, b) => String(b.last ?? '').localeCompare(String(a.last ?? '')),
      cost: (a, b) => b.cost - a.cost,
      name: (a, b) => a.project.name.localeCompare(b.project.name, 'he'),
    };
    return out.sort(by[f.sort] ?? by.attention);
  }, [views, f]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">פרויקטים</h1>
          <p className="mt-1 text-sm text-ink-2">{views.length} פרויקטים · {views.reduce((s, v) => s + v.attention, 0)} פריטים שמחכים לטיפול שלך</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => nav.quickAdd('project')}>פרויקט חדש</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card">
        <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="חיפוש לפי שם, ריפו או סוכן…" />
        <div className="w-40"><Select aria-label="סינון לפי מצב" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">כל המצבים</option>{ORDER.map((s) => <option key={s} value={s}>{STATUS[s].he}</option>)}</Select></div>
        <div className="w-44"><Select aria-label="מיון" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}><option value="attention">מיון: דורש טיפול</option><option value="recent">מיון: פעילות אחרונה</option><option value="cost">מיון: עלות</option><option value="name">מיון: שם</option></Select></div>
        {(f.q || f.status) && <button type="button" className="text-sm text-primary hover:underline" onClick={() => setF({ ...f, q: '', status: '' })}>נקה סינון</button>}
      </div>
      {!list.length ? (
        <Card><EmptyState icon="folder" title="לא נמצאו פרויקטים" text="נסה חיפוש אחר או נקה את הסינון." action={<Button onClick={() => setF({ ...f, q: '', status: '' })}>נקה סינון</Button>} /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <button key={v.project.id} type="button" onClick={() => nav.go({ screen: 'project', id: v.project.id })}
              className="group flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-start shadow-card transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop">
              <div className="flex items-start gap-3">
                <Avatar name={shortName(v.project.name)} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{v.project.name}</div>
                  <div className="ltr truncate text-start text-[12px] text-muted">{v.project.repo}</div>
                </div>
                <StatusBadge status={v.status} short />
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-2.5 text-center text-[12px]">
                <div><div className="tnum text-base font-bold">{v.agents.length}</div><div className="text-muted">סוכנים</div></div>
                <div><div className={`tnum text-base font-bold ${v.attention ? 'text-needs' : ''}`}>{v.attention}</div><div className="text-muted">לטיפולך</div></div>
                <div><div className="tnum text-base font-bold">{usd(v.cost)}</div><div className="text-muted">עלות</div></div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                <span className="inline-flex items-center gap-1"><Icon name="clock" size={13} />{v.last ? ago(v.last) : 'אין פעילות'}</span>
                {v.openTasks > 0 && <Badge icon="tasks">{v.openTasks} משימות</Badge>}
                {v.followUp && <Badge tone={v.followUp < todayISO() ? 'failed' : 'accent'} icon="calendar">מעקב {dateHe(v.followUp)}</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Tab = 'overview' | 'agents' | 'tasks' | 'docs' | 'notes';

export function ProjectPage({ id }: { id: string }) {
  const { data, actions } = useOffice();
  const nav = useNav();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = usePersisted<Tab>('project:tab', 'overview');
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState('');
  const [saving, setSaving] = useState(false);
  const v = useMemo(() => projectViews(data).find((x) => x.project.id === id), [data, id]);
  if (!v) return <Card><EmptyState icon="folder" title="הפרויקט לא נמצא" text="ייתכן שהוא הוסר מהמאגר." action={<Button onClick={() => nav.go({ screen: 'projects' })}>לכל הפרויקטים</Button>} /></Card>;
  const tasks = data.tasks.filter((t) => t.project === id).sort((a, b) => Number(a.done) - Number(b.done) || String(a.due ?? '9').localeCompare(String(b.due ?? '9')));
  const notes = data.notes.filter((n) => n.project === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const docs = v.agents.flatMap((a) => (a.artifacts ?? []).map((d) => ({ ...d, agent: a })));
  const fu = dueLabel(v.followUp);

  const saveFollow = async (value: string) => {
    try { await actions.setProjectMeta(id, { followUp: value || undefined }); toast({ tone: 'success', text: value ? `תאריך מעקב נקבע ל-${dateHe(value)}` : 'תאריך המעקב הוסר' }); }
    catch (e) { toast({ tone: 'error', text: `לא נשמר: ${e instanceof Error ? e.message : e}` }); }
  };
  const addNote = async () => {
    const t = note.trim();
    if (t.length < 2) { setNoteErr('כתוב לפחות 2 תווים'); return; }
    setSaving(true);
    try { await actions.addNote(id, t); setNote(''); setNoteErr(''); toast({ tone: 'success', text: 'ההערה נשמרה' }); }
    catch (e) { toast({ tone: 'error', text: `לא נשמר: ${e instanceof Error ? e.message : e}` }); }
    finally { setSaving(false); }
  };
  const delNote = async (nid: string) => {
    if (!(await confirm({ title: 'למחוק את ההערה?', text: 'אפשר לבטל מיד אחרי המחיקה.', confirm: 'מחק', danger: true }))) return;
    try { const n = await actions.deleteNote(nid); toast({ tone: 'success', text: 'ההערה נמחקה', undo: n ? () => void actions.restoreNote(n) : undefined }); }
    catch (e) { toast({ tone: 'error', text: `המחיקה נכשלה: ${e instanceof Error ? e.message : e}` }); }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={shortName(v.project.name)} size={48} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{v.project.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <StatusBadge status={v.status} />
              <a className="ltr inline-flex items-center gap-1 text-primary hover:underline" href={`https://github.com/${v.project.repo}`} target="_blank" rel="noopener">{v.project.repo}<Icon name="external" size={13} /></a>
              <span>· {v.last ? `פעילות ${ago(v.last)}` : 'אין פעילות'}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon="plus" onClick={() => nav.editTask({ project: id, priority: 'medium' })}>משימה לפרויקט</Button>
          <Button icon="house" onClick={() => nav.go({ screen: 'house' })}>צפה בבית</Button>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'סקירה' }, { id: 'agents', label: 'סוכנים', count: v.agents.length }, { id: 'tasks', label: 'משימות', count: tasks.filter((t) => !t.done).length },
        { id: 'docs', label: 'מסמכים', count: docs.length }, { id: 'notes', label: 'הערות', count: notes.length },
      ]} />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader icon="hand" title="מה מחכה לך בפרויקט" subtitle={v.attention ? `${v.attention} פריטים` : 'שום דבר לא מחכה'} />
            <div className="grid gap-2 p-4">
              {v.agents.filter((a) => ['needs_input', 'failed', 'review'].includes(a.status)).map((a) => (
                <button key={a.id} type="button" onClick={() => nav.openAgent(a.id)} className="flex items-start gap-3 rounded-xl border border-line p-3 text-start hover:bg-surface-2">
                  <StatusBadge status={a.status} short />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{a.name}</span><span className="block text-[13px] text-ink-2">{a.needsAction ?? a.detail}</span></span>
                  <span className="shrink-0 text-[12px] text-muted">{ago(a.updatedAt)}</span>
                </button>
              ))}
              {!v.agents.some((a) => ['needs_input', 'failed', 'review'].includes(a.status)) && <p className="py-4 text-center text-[13px] text-muted">{v.project.note ?? 'הכל מטופל בפרויקט הזה.'}</p>}
            </div>
          </Card>
          <Card>
            <CardHeader icon="calendar" title="מעקב ופרטים" />
            <div className="grid gap-4 p-4">
              <Field label="תאריך מעקב הבא" htmlFor="followup" hint={v.followUp ? fu.text : 'יופיע בלוח השנה ובתזכורות'}>
                <div className="flex gap-2">
                  <TextInput id="followup" type="date" defaultValue={v.followUp ?? ''} key={v.followUp ?? 'none'} onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) || !e.target.value) void saveFollow(e.target.value); }} />
                  {v.followUp && <Button variant="ghost" onClick={() => saveFollow('')}>נקה</Button>}
                </div>
              </Field>
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <div><dt className="text-muted">עלות מצטברת</dt><dd className="tnum mt-0.5 font-semibold">{usd(v.cost, 2)}</dd></div>
                <div><dt className="text-muted">משימות פתוחות</dt><dd className="tnum mt-0.5 font-semibold">{v.openTasks}</dd></div>
                <div><dt className="text-muted">סוכנים</dt><dd className="tnum mt-0.5 font-semibold">{v.agents.length}</dd></div>
                <div><dt className="text-muted">מסמכים</dt><dd className="tnum mt-0.5 font-semibold">{docs.length}</dd></div>
              </dl>
            </div>
          </Card>
        </div>
      )}

      {tab === 'agents' && (
        <Card>
          {v.agents.length ? (
            <ul className="divide-y divide-line">
              {v.agents.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => nav.openAgent(a.id)} className="flex w-full items-center gap-3 px-5 py-3 text-start hover:bg-surface-2">
                    <Avatar name={a.name} size={34} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.name}</span><span className="block truncate text-[12.5px] text-muted">{a.detail}</span></span>
                    <span className="hidden text-[12px] text-muted sm:block">{ago(a.updatedAt)}</span>
                    <StatusBadge status={a.status} short />
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="agent" title="אין סוכנים בפרויקט" text={v.project.note ?? 'כשסשן חדש ייפתח על הריפו הזה, הוא יופיע כאן אחרי עדכון המשרד.'} />}
        </Card>
      )}

      {tab === 'tasks' && (
        <Card>
          <CardHeader icon="tasks" title="משימות הפרויקט" actions={<Button size="sm" icon="plus" onClick={() => nav.editTask({ project: id, priority: 'medium' })}>משימה חדשה</Button>} />
          <div className="p-4">{tasks.length ? <TaskMiniList tasks={tasks} /> : <EmptyState icon="tasks" title="אין משימות עדיין" text="צור משימה כדי לעקוב אחרי מה שצריך לעשות בפרויקט." />}</div>
        </Card>
      )}

      {tab === 'docs' && (
        <Card>
          {docs.length ? (
            <ul className="divide-y divide-line">
              {docs.map((d) => (
                <li key={d.url} className="flex items-center gap-3 px-5 py-3">
                  <Icon name="file" className="text-muted" />
                  <div className="min-w-0 flex-1"><a href={d.url} target="_blank" rel="noopener" className="block truncate text-sm font-medium hover:text-primary">{d.title}</a><button type="button" className="text-[12.5px] text-muted hover:text-primary" onClick={() => nav.openAgent(d.agent.id)}>{d.agent.name}</button></div>
                  <a href={d.url} target="_blank" rel="noopener" aria-label={`פתח את ${d.title}`} className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2"><Icon name="external" size={16} /></a>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="file" title="אין מסמכים" text="הסוכנים של הפרויקט הזה לא פרסמו מסמכים עדיין." />}
        </Card>
      )}

      {tab === 'notes' && (
        <Card>
          <div className="grid gap-2 border-b border-line p-4">
            <Field label="הערה חדשה" htmlFor="newnote" error={noteErr}>
              <TextArea id="newnote" value={note} invalid={!!noteErr} placeholder="למשל: לבדוק את הפריסה אחרי העדכון של יום ראשון" onChange={(e) => { setNote(e.target.value); if (noteErr && e.target.value.trim().length >= 2) setNoteErr(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void addNote(); }} />
            </Field>
            <div className="flex items-center justify-between gap-2"><span className="text-[12px] text-muted">Ctrl+Enter לשמירה</span><Button variant="primary" loading={saving} onClick={addNote}>שמור הערה</Button></div>
          </div>
          {notes.length ? (
            <ul className="divide-y divide-line">
              {notes.map((n) => (
                <li key={n.id} className="flex items-start gap-3 px-5 py-3">
                  <Icon name="note" className="mt-0.5 text-muted" />
                  <div className="min-w-0 flex-1"><p className="whitespace-pre-wrap text-sm">{n.text}</p><p className="mt-1 text-[12px] text-muted">{ago(n.createdAt)}</p></div>
                  <button type="button" aria-label="מחק הערה" onClick={() => delNote(n.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-failed-soft hover:text-failed"><Icon name="trash" size={15} /></button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="note" title="אין הערות" text="הערות עוזרות לזכור הקשר בין סשנים." />}
        </Card>
      )}
    </div>
  );
}
