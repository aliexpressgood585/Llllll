import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Button, Card, CardHeader, IconButton, Segmented, Select, StatusBadge } from '../components/ui';
import { STATUS } from '../lib/constants';
import { projectViews } from '../lib/derive';
import { ago, shortName } from '../lib/format';
import { useNav } from '../lib/nav';
import { useOffice } from '../lib/store';
import type { ProjectStatus } from '../lib/types';
import { usePersisted } from '../lib/usePersisted';
import { COLORS, HouseEngine, ROOMS, type Activity, type Labels, type LogEntry, type Mode, type Resident } from '../house/engine';

const label = (name: string) => { const s = name.trim(); return s.length > 20 ? `${s.slice(0, 19)}…` : s; };

export function House() {
  const { data } = useOffice();
  const nav = useNav();
  const sceneRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const eng = useRef<HouseEngine | null>(null);
  const [prefs, setPrefs] = usePersisted('house:prefs', { mode: 'auto' as Mode, labels: 'all' as Labels, project: '', speed: 1 });
  const [follow, setFollow] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [acts, setActs] = useState<Record<string, Activity>>({});
  const [full, setFull] = useState(false);

  // selecting a resident opens its card (agent drawer, or the project page for an empty project)
  const openRef = useRef<(id: string) => void>(() => {});
  openRef.current = (id: string) => { if (id.startsWith('project:')) nav.go({ screen: 'project', id: id.slice(8) }); else nav.openAgent(id); };

  const views = useMemo(() => projectViews(data), [data]);
  const residents = useMemo<Resident[]>(() => {
    const out: Resident[] = data.agents.map((a) => ({
      id: a.id, kind: 'agent', label: label(a.name), full: a.name, project: a.project,
      projectName: data.projects.find((p) => p.id === a.project)?.name ?? a.project, status: a.status, say: a.needsAction || a.detail,
    }));
    for (const v of views) if (!v.agents.length) out.push({ id: `project:${v.project.id}`, kind: 'project', label: shortName(v.project.name), full: v.project.name, project: v.project.id, projectName: v.project.name, status: 'idle', say: v.project.note });
    return out;
  }, [data.agents, data.projects, views]);

  // engine lifecycle
  useEffect(() => {
    if (!sceneRef.current || !camRef.current || !canvasRef.current || !overlayRef.current) return;
    const e = new HouseEngine({
      scene: sceneRef.current, cam: camRef.current, canvas: canvasRef.current, overlay: overlayRef.current,
      onSelect: (id) => openRef.current(id),
      onLog: (entry) => setLog((l) => [entry, ...l].slice(0, 60)),
    });
    eng.current = e;
    return () => { e.destroy(); eng.current = null; };
  }, []);
  useEffect(() => { eng.current?.setResidents(residents); }, [residents]);
  useEffect(() => { const e = eng.current; if (!e) return; e.setMode(prefs.mode); e.setLabels(prefs.labels); e.setHighlight(prefs.project); e.speed = prefs.speed; }, [prefs]);
  useEffect(() => { if (eng.current) eng.current.follow = follow; }, [follow]);
  // what each resident is doing, refreshed for the list below the house
  useEffect(() => {
    const read = () => { const e = eng.current; if (!e) return; const m: Record<string, Activity> = {}; for (const id of e.ids()) { const a = e.activity(id); if (a) m[id] = a; } setActs(m); };
    read();
    const iv = setInterval(read, 1200);
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  // keyboard: ← → between residents, + / − zoom, 0 fit, F follow
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (t.closest('input,textarea,select,[role=dialog]') || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const e = eng.current; if (!e) return;
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        const ids = residents.filter((r) => !prefs.project || r.project === prefs.project).map((r) => r.id);
        if (!ids.length) return;
        const i = Math.max(-1, ids.indexOf(e.selected ?? ''));
        const n = (i + (ev.key === 'ArrowLeft' ? 1 : -1) + ids.length) % ids.length;
        e.select(ids[n]); setFollow(true); ev.preventDefault();
      } else if (ev.key === '+' || ev.key === '=') e.zoom(1.25);
      else if (ev.key === '-') e.zoom(0.8);
      else if (ev.key === '0') { e.fit(); setFollow(false); }
      else if (ev.key.toLowerCase() === 'f') setFollow((f) => !f);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [residents, prefs.project]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of residents) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [residents]);
  const agentsOnly = residents.filter((r) => r.kind === 'agent' && (!prefs.project || r.project === prefs.project));
  const working = Object.entries(acts).filter(([, a]) => !a.walking).length;

  const pick = (id: string) => { eng.current?.select(id); setFollow(true); openRef.current(id); };
  const toggleFull = () => {
    const w = wrapRef.current; if (!w) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void w.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">הבית החי</h1>
          <p className="mt-1 text-sm text-ink-2">
            כל סוכן הוא דייר: {agentsOnly.length} סוכנים ב-{data.projects.length} פרויקטים, {working} בפעולה ברגע זה. לחץ על דייר כדי לפתוח את הכרטיס שלו.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
          {(['working', 'needs_input', 'failed', 'review', 'done', 'idle'] as ProjectStatus[]).filter((s) => counts[s]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[s] }} aria-hidden /><Icon name={STATUS[s].icon} size={13} />{STATUS[s].he} <b className="tnum">{counts[s]}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2.5 shadow-card">
        <div className="max-w-full overflow-x-auto scroll-thin"><Segmented label="איך הדיירים מתנהגים" value={prefs.mode} onChange={(mode) => setPrefs({ ...prefs, mode })}
          options={[{ value: 'auto', label: 'אוטונומי — כולם בפעולה' }, { value: 'status', label: 'כל אחד בחדר של המצב שלו' }]} /></div>
        <div className="max-w-full overflow-x-auto scroll-thin"><Segmented label="תוויות שמות" value={prefs.labels} onChange={(labels) => setPrefs({ ...prefs, labels })}
          options={[{ value: 'all', label: 'כל השמות' }, { value: 'attention', label: 'רק מי שצריך אותך' }, { value: 'none', label: 'בלי שמות' }]} /></div>
        <div className="w-48"><Select aria-label="הדגש פרויקט" value={prefs.project} onChange={(e) => setPrefs({ ...prefs, project: e.target.value })}><option value="">כל הפרויקטים</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        <div className="w-32"><Select aria-label="מהירות" value={String(prefs.speed)} onChange={(e) => setPrefs({ ...prefs, speed: Number(e.target.value) })}><option value="0.5">מהירות ×0.5</option><option value="1">מהירות רגילה</option><option value="2">מהירות ×2</option></Select></div>
        <div className="ms-auto flex items-center gap-1">
          <IconButton icon="plus" label="התקרב (+)" onClick={() => eng.current?.zoom(1.3)} />
          <IconButton icon="minus" label="התרחק (−)" onClick={() => eng.current?.zoom(0.77)} />
          <Button size="sm" variant="ghost" onClick={() => { eng.current?.fit(); setFollow(false); }}>כל הבית</Button>
          <Button size="sm" variant={follow ? 'primary' : 'secondary'} icon="eye" aria-pressed={follow} onClick={() => setFollow((f) => !f)} title="המצלמה עוקבת אחרי הדייר שנבחר">עקוב</Button>
          <IconButton icon={full ? 'x' : 'expand'} label={full ? 'צא ממסך מלא' : 'מסך מלא'} onClick={toggleFull} />
        </div>
      </div>

      <div ref={wrapRef} className="house-wrap -mx-1 overflow-x-auto px-1 scroll-thin">
        <div ref={sceneRef} className="house-scene" aria-label="הבית של הסוכנים">
          <div ref={camRef} className="house-cam">
            <canvas ref={canvasRef} className="house-canvas" role="img" aria-label={`הבית: ${agentsOnly.length} סוכנים. רשימה נגישה של כל הדיירים ומה הם עושים נמצאת מתחת לבית.`} />
            <div ref={overlayRef} className="house-overlay" />
          </div>
          <p className="house-hint">גרירה להזזה אחרי התקרבות · לחיצה כפולה להתקרבות · ← → בין דיירים · F מעקב · 0 לכל הבית</p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader icon="agent" title="מה כל אחד עושה עכשיו" subtitle="הפעולה בבית היא הדמיה חיה; המצב (התג) הוא המצב האמיתי של הסשן" />
          <ul className="max-h-[420px] divide-y divide-line overflow-auto scroll-thin">
            {agentsOnly.sort((a, b) => a.label.localeCompare(b.label, 'he')).map((r) => {
              const a = acts[r.id];
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => pick(r.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-start hover:bg-surface-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${COLORS[r.status]}33`, color: 'var(--ink)' }}><Icon name={a?.walking ? 'chevronLeft' : STATUS[r.status].icon} size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.full}</span>
                      <span className="block truncate text-[12.5px] text-muted">{shortName(r.projectName)} · {a ? `${a.act}${a.walking ? '' : ` · ${ROOMS[a.room].he}`}` : '—'}</span>
                    </span>
                    <StatusBadge status={r.status} short />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader icon="list" title="יומן הבית" subtitle="שינויי מצב אמיתיים מודגשים" actions={log.length ? <Button size="sm" variant="ghost" onClick={() => setLog([])}>נקה</Button> : undefined} />
          <ol className="max-h-[420px] overflow-auto px-5 py-2 scroll-thin" aria-live="polite">
            {!log.length && <li className="py-6 text-center text-[13px] text-muted">הדיירים מתחילים לזוז — הפעולות יופיעו כאן.</li>}
            {log.slice(0, 40).map((e) => (
              <li key={e.key} className="flex gap-2 border-b border-line/60 py-2 text-[13px] last:border-0">
                <span className="w-14 shrink-0 text-muted">{ago(new Date(e.t).toISOString())}</span>
                <button type="button" className="min-w-0 flex-1 text-start hover:text-primary" onClick={() => pick(e.id)}>
                  <b className="font-semibold">{e.who}</b> <span className={e.real ? 'font-semibold text-needs' : 'text-ink-2'}>{e.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
