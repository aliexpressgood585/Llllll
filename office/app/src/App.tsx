import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from './components/Icon';
import { AgentDrawer, CommandPalette, NotificationsPanel, QuickAdd, TaskEditor, useNotifications } from './components/overlays';
import { Button, ConfirmProvider, Dialog, IconButton, Kbd, Skeleton, ToastProvider } from './components/ui';
import { taskBuckets, waitingOnYou } from './lib/derive';
import { ago, shortName } from './lib/format';
import { NavCtx, SCREENS, type NavApi, type Route, type Screen } from './lib/nav';
import { DataProvider, useOffice } from './lib/store';
import type { Task } from './lib/types';
import { usePersisted } from './lib/usePersisted';
import { Agents } from './screens/Agents';
import { Board } from './screens/Board';
import { Dashboard } from './screens/Dashboard';
import { Docs } from './screens/Docs';
import { Goals } from './screens/Goals';
import { House } from './screens/House';
import { ProjectPage, Projects } from './screens/Projects';
import { Reports } from './screens/Reports';
import { Tasks } from './screens/Tasks';

export function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <DataProvider>
          <Shell />
        </DataProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

const VALID = new Set<Screen>(['dashboard', 'house', 'agents', 'projects', 'project', 'board', 'tasks', 'docs', 'reports', 'goals']);

function Shell() {
  const { data } = useOffice();
  const [route, setRoute] = usePersisted<Route>('route', { screen: 'house' });
  const [agentId, setAgentId] = useState<string | null>(null);
  const [task, setTask] = useState<(Partial<Task> & { id?: string }) | null>(null);
  const [quick, setQuick] = useState<'task' | 'note' | 'project' | null>(null);
  const [palette, setPalette] = useState(false);
  const [bell, setBell] = useState(false);
  const [help, setHelp] = useState(false);
  const [howto, setHowto] = useState(false);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = usePersisted<'system' | 'light' | 'dark'>('theme', 'system');
  const notes = useNotifications();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  }, [theme]);

  const safe = VALID.has(route.screen) ? route : { screen: 'house' as Screen };
  const go = useCallback((r: Route) => { setRoute(r); setMenu(false); setAgentId(null); window.scrollTo?.({ top: 0 }); }, [setRoute]);
  const nav = useMemo<NavApi>(() => ({
    route: safe, go,
    openAgent: (id) => setAgentId(id),
    editTask: (prefill) => setTask(prefill ?? {}),
    quickAdd: (kind) => setQuick(kind ?? 'task'),
    openPalette: () => setPalette(true),
  }), [safe, go]);

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); return; }
      if (typing || document.querySelector('[role=dialog][aria-modal=true]')) return;
      if (e.altKey && /^[1-9]$/.test(e.key)) { const s = SCREENS.find((x) => x.key === e.key); if (s) { e.preventDefault(); go({ screen: s.id }); } return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); setPalette(true); }
      else if (e.key.toLowerCase() === 'n') { e.preventDefault(); setTask({}); }
      else if (e.key === '?') { e.preventDefault(); setHelp(true); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [go]);

  const waiting = waitingOnYou(data).length;
  const badges: Partial<Record<Screen, number>> = { board: waiting, tasks: (() => { const b = taskBuckets(data.tasks); return b.overdue.length + b.today.length; })() };
  const current = SCREENS.find((s) => s.id === (safe.screen === 'project' ? 'projects' : safe.screen));
  const project = safe.screen === 'project' ? data.projects.find((p) => p.id === safe.id) : undefined;
  const wide = safe.screen === 'house';

  const sidebar = (
    <nav aria-label="ניווט ראשי" className="flex h-full flex-col gap-1 p-3">
      <div className="mb-3 flex items-center gap-2.5 px-2 py-1.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-ink"><Icon name="house" size={18} /></span>
        <div><div className="text-[15px] font-bold leading-tight">משרד הסוכנים</div><div className="text-[12px] text-muted">{data.agents.length} סוכנים · {data.projects.length} פרויקטים</div></div>
      </div>
      {SCREENS.map((s) => {
        const active = current?.id === s.id;
        const n = badges[s.id];
        return (
          <button key={s.id} type="button" onClick={() => go({ screen: s.id })} aria-current={active ? 'page' : undefined}
            className={`group flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition ${active ? 'bg-primary-soft font-semibold text-primary' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
            <Icon name={s.icon} size={18} />
            <span className="flex-1 text-start">{s.label}</span>
            {n ? <span className={`tnum min-w-5 rounded-full px-1.5 text-center text-[11.5px] font-semibold ${s.id === 'board' ? 'bg-needs-soft text-needs' : 'bg-surface-3 text-ink-2'}`}>{n}</span> : <span className="hidden text-[11px] text-muted group-hover:inline"><Kbd>Alt+{s.key}</Kbd></span>}
          </button>
        );
      })}
      <div className="mt-auto grid gap-2 border-t border-line pt-3">
        <div className="flex items-center justify-between px-2 text-[12.5px] text-muted">
          <span>ערכת צבעים</span>
          <div className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="ערכת צבעים">
            {([['system', 'אוטו'], ['light', 'בהיר'], ['dark', 'כהה']] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={theme === v} onClick={() => setTheme(v)} className={`rounded-md px-2 py-1 text-[12px] ${theme === v ? 'bg-surface font-semibold text-ink shadow-card' : 'text-ink-2'}`}>{l}</button>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => setHelp(true)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-muted hover:bg-surface-2 hover:text-ink"><Icon name="keyboard" size={15} />קיצורי מקלדת <Kbd>?</Kbd></button>
      </div>
    </nav>
  );

  return (
    <NavCtx.Provider value={nav}>
      <div className="min-h-dvh bg-bg text-ink lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-e border-line bg-surface scroll-thin lg:block">{sidebar}</aside>
        {menu && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="תפריט">
            <div className="fade-in absolute inset-0 bg-black/40" onClick={() => setMenu(false)} />
            <aside className="absolute inset-y-0 right-0 w-[280px] overflow-y-auto bg-surface shadow-pop scroll-thin">{sidebar}</aside>
          </div>
        )}
        <div className="min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-5">
            <IconButton icon="menu" label="פתח תפריט" className="lg:hidden" onClick={() => setMenu(true)} />
            <nav aria-label="פירורי לחם" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-1.5 text-sm">
                <li><button type="button" className="text-muted hover:text-ink" onClick={() => go({ screen: 'dashboard' })}>משרד</button></li>
                {current && <><li aria-hidden className="text-muted"><Icon name="chevronLeft" size={14} /></li><li className="min-w-0"><button type="button" className={`truncate ${project ? 'text-muted hover:text-ink' : 'font-semibold'}`} onClick={() => go({ screen: current.id })} aria-current={project ? undefined : 'page'}>{current.label}</button></li></>}
                {project && <><li aria-hidden className="text-muted"><Icon name="chevronLeft" size={14} /></li><li className="min-w-0 truncate font-semibold" aria-current="page">{shortName(project.name)}</li></>}
              </ol>
            </nav>
            <button type="button" onClick={() => setPalette(true)} className="hidden h-9 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-[13px] text-muted hover:border-line-strong hover:text-ink md:flex">
              <Icon name="search" size={15} />חיפוש בכל המשרד<Kbd>Ctrl K</Kbd>
            </button>
            <IconButton icon="search" label="חיפוש" className="md:hidden" onClick={() => setPalette(true)} />
            <button type="button" onClick={() => setHowto(true)} className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] sm:flex ${data.meta.updatedAt ? 'bg-surface-2 text-ink-2 hover:bg-surface-3' : 'bg-needs-soft text-needs'}`} title="איך הנתונים מתעדכנים">
              <Icon name="refresh" size={13} />{data.meta.updatedAt ? `נתונים ${ago(data.meta.updatedAt)}` : 'אין חותמת עדכון'}
            </button>
            <div className="relative">
              <IconButton icon="bell" label={`התראות (${notes.length})`} onClick={() => setBell((b) => !b)} aria-expanded={bell} />
              {notes.length > 0 && <span className="tnum pointer-events-none absolute -top-0.5 -left-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-failed px-1 text-[10px] font-bold text-white">{notes.length}</span>}
              {bell && <><div className="fixed inset-0 z-30" onClick={() => setBell(false)} /><NotificationsPanel onClose={() => setBell(false)} /></>}
            </div>
            <Button variant="primary" icon="plus" onClick={() => setQuick('task')} className="max-sm:px-2.5"><span className="max-sm:hidden">הוספה מהירה</span></Button>
          </header>

          <main id="main" className={`mx-auto w-full px-3 py-5 sm:px-5 lg:py-6 ${wide ? 'max-w-[1800px]' : 'max-w-[1400px]'}`}>
            {data.state === 'loading' ? <Loading /> : data.state === 'unavailable' ? <Problem title="אין גישה לנתוני המשרד בתצוגה הזו" text="הדף צריך לרוץ כ-Artifact ב-claude.ai כדי לקרוא את מאגר הנתונים. פתח את הקישור ישירות." />
              : data.state === 'error' ? <Problem title="לא הצלחתי לטעון את הנתונים" text={data.error ?? ''} retry /> : (
                <div key={safe.screen + (safe.id ?? '')} className="fade-in">
                  {safe.screen === 'dashboard' && <Dashboard />}
                  {safe.screen === 'house' && <House />}
                  {safe.screen === 'board' && <Board />}
                  {safe.screen === 'tasks' && <Tasks />}
                  {safe.screen === 'projects' && <Projects />}
                  {safe.screen === 'project' && <ProjectPage id={safe.id ?? ''} />}
                  {safe.screen === 'agents' && <Agents />}
                  {safe.screen === 'docs' && <Docs />}
                  {safe.screen === 'reports' && <Reports />}
                  {safe.screen === 'goals' && <Goals />}
                </div>
              )}
          </main>
        </div>
      </div>

      <AgentDrawer id={agentId} onClose={() => setAgentId(null)} />
      <TaskEditor open={!!task} onClose={() => setTask(null)} initial={task ?? undefined} />
      <QuickAdd open={!!quick} kind={quick ?? 'task'} onClose={() => setQuick(null)} onTask={() => setTask({})} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Dialog open={help} onClose={() => setHelp(false)} title="קיצורי מקלדת" width={460}>
        <ul className="grid gap-2 text-sm">
          {[['Ctrl K או /', 'חיפוש ופקודות'], ['N', 'משימה חדשה'], ['Alt + 1…9', 'מעבר בין המסכים'], ['?', 'החלון הזה'], ['Esc', 'סגירת חלון'], ['← →', 'בבית: מעבר בין דיירים'], ['+ − 0', 'בבית: התקרבות, התרחקות, כל הבית'], ['F', 'בבית: מצלמה עוקבת']].map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0"><span className="text-ink-2">{v}</span><Kbd>{k}</Kbd></li>
          ))}
        </ul>
      </Dialog>
      <Dialog open={howto} onClose={() => setHowto(false)} title="איך הנתונים מתעדכנים" width={500}>
        <div className="grid gap-3 text-sm leading-relaxed text-ink-2">
          <p>מצב הסוכנים והפרויקטים נכתב למאגר של הדף. כדי לרענן אותו, כתוב ל-Claude <b className="text-ink">"תעדכן את המשרד"</b>: הוא מושך את המצב העדכני של כל הסשנים והריפוזיטוריז ומעדכן — והדף משתנה מיד אצל כל מי שפתוח עליו.</p>
          <p>משימות, הערות, שלבי טיפול, תאריכי מעקב ויעדים נשמרים מיד כשאתה משנה אותם, ומשותפים לכל מי שפותח את המשרד.</p>
          <p className="text-muted">עדכון אחרון של מצב הסוכנים: {data.meta.updatedAt ? new Date(data.meta.updatedAt).toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' }) : 'לא ידוע'}</p>
        </div>
      </Dialog>
    </NavCtx.Provider>
  );
}

function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="טוען">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      <Skeleton className="h-[420px]" />
    </div>
  );
}

function Problem({ title, text, retry }: { title: string; text: string; retry?: boolean }) {
  return (
    <div className="mx-auto mt-10 grid max-w-md justify-items-center gap-3 rounded-2xl border border-line bg-surface p-8 text-center shadow-card" role="alert">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-failed-soft text-failed"><Icon name="alert" size={22} /></span>
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="text-sm text-ink-2">{text}</p>
      {retry && <Button variant="primary" icon="refresh" onClick={() => location.reload()}>נסה שוב</Button>}
    </div>
  );
}
