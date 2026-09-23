import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type Agent, type Meta, type Note, type Project, type ProjectMeta, type Settings, type Task, type Triage, type TriageStage } from './types';
import { uid } from './format';

/* ---------- minimal typing of the artifact runtime we use ---------- */
interface Snap { id: string; exists: boolean; data(): Record<string, unknown> | undefined }
interface QSnap { docs: Snap[] }
interface DocRef { set(d: Record<string, unknown>): Promise<void>; update(d: Record<string, unknown>): Promise<void>; delete(): Promise<void>; onSnapshot(n: (s: Snap) => void, e?: (err: { code?: string; message?: string }) => void): () => void }
interface ColRef { doc(id: string): DocRef; onSnapshot(n: (s: QSnap) => void, e?: (err: { code?: string; message?: string }) => void): () => void }
interface DB { collection(p: string): ColRef; doc(p: string): DocRef }
interface Downloads { save(r: { filename: string; data: string }): Promise<{ status: string }> }
declare global {
  interface Window { claude?: { use?: (name: string) => Promise<unknown> } }
}

export type LoadState = 'loading' | 'ready' | 'unavailable' | 'error';

export interface OfficeData {
  state: LoadState;
  error?: string;
  projects: Project[];
  agents: Agent[];
  tasks: Task[];
  notes: Note[];
  triage: Record<string, Triage>;
  pmeta: Record<string, ProjectMeta>;
  settings: Settings;
  meta: Meta;
}

export interface Actions {
  addTask(t: Omit<Task, 'id' | 'createdAt' | 'done'> & { done?: boolean }): Promise<string>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
  deleteTask(id: string): Promise<Task | undefined>;
  restoreTask(t: Task): Promise<void>;
  addNote(project: string, text: string): Promise<void>;
  deleteNote(id: string): Promise<Note | undefined>;
  restoreNote(n: Note): Promise<void>;
  setStage(agentId: string, stage: TriageStage): Promise<TriageStage>;
  setProjectMeta(id: string, patch: Partial<ProjectMeta>): Promise<void>;
  addProject(p: { name: string; repo: string }): Promise<string>;
  saveSettings(s: Settings): Promise<void>;
  exportFile(filename: string, data: string): Promise<'saved' | 'copied' | 'failed'>;
}

const Ctx = createContext<{ data: OfficeData; actions: Actions } | null>(null);

const clean = <T extends object>(o: T) => JSON.parse(JSON.stringify(o)) as Record<string, unknown>; // drop undefined

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<OfficeData>({ state: 'loading', projects: [], agents: [], tasks: [], notes: [], triage: {}, pmeta: {}, settings: DEFAULT_SETTINGS, meta: {} });
  const dbRef = useRef<DB | null>(null);
  const dlRef = useRef<Downloads | null>(null);

  useEffect(() => {
    let alive = true;
    const unsubs: (() => void)[] = [];
    const seen = new Set<string>();
    const REQUIRED = ['rooms', 'agents'];
    const fail = (err: { code?: string; message?: string }) => alive && setData((d) => ({ ...d, state: 'error', error: err?.message || err?.code || 'שגיאה לא ידועה' }));
    const mark = (k: string) => { seen.add(k); if (REQUIRED.every((r) => seen.has(r))) setData((d) => (d.state === 'loading' ? { ...d, state: 'ready' } : d)); };
    const timeout = setTimeout(() => alive && setData((d) => (d.state === 'loading' ? { ...d, state: 'error', error: 'הנתונים לא נטענו תוך 15 שניות' } : d)), 15000);

    (async () => {
      const db = (await window.claude?.use?.('db')) as DB | null | undefined;
      if (!alive) return;
      if (!db) { clearTimeout(timeout); setData((d) => ({ ...d, state: 'unavailable' })); return; }
      dbRef.current = db;
      window.claude?.use?.('downloads').then((x) => { dlRef.current = (x as Downloads) ?? null; }).catch(() => {});
      const list = <T,>(snap: QSnap) => snap.docs.filter((s) => s.exists).map((s) => ({ id: s.id, ...(s.data() as object) }) as T);
      const byId = <T extends { id: string }>(arr: T[]) => Object.fromEntries(arr.map((x) => [x.id, x]));
      unsubs.push(db.collection('rooms').onSnapshot((s) => { setData((d) => ({ ...d, projects: list<Project>(s).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)) })); mark('rooms'); }, fail));
      unsubs.push(db.collection('agents').onSnapshot((s) => { setData((d) => ({ ...d, agents: list<Agent>(s) })); mark('agents'); }, fail));
      unsubs.push(db.collection('tasks').onSnapshot((s) => setData((d) => ({ ...d, tasks: list<Task>(s) })), fail));
      unsubs.push(db.collection('notes').onSnapshot((s) => setData((d) => ({ ...d, notes: list<Note>(s) })), fail));
      unsubs.push(db.collection('triage').onSnapshot((s) => setData((d) => ({ ...d, triage: byId(list<Triage>(s)) })), fail));
      unsubs.push(db.collection('projectMeta').onSnapshot((s) => setData((d) => ({ ...d, pmeta: byId(list<ProjectMeta>(s)) })), fail));
      unsubs.push(db.doc('settings/app').onSnapshot((s) => setData((d) => ({ ...d, settings: { ...DEFAULT_SETTINGS, ...((s.exists ? s.data() : {}) as Partial<Settings>) } })), fail));
      unsubs.push(db.doc('meta/office').onSnapshot((s) => setData((d) => ({ ...d, meta: (s.exists ? s.data() : {}) as Meta })), fail));
      clearTimeout(timeout);
    })().catch((e) => fail({ message: String(e) }));
    return () => { alive = false; clearTimeout(timeout); unsubs.forEach((u) => u()); };
  }, []);

  const need = useCallback(() => { if (!dbRef.current) throw new Error('אין חיבור למאגר הנתונים'); return dbRef.current; }, []);

  const actions = useMemo<Actions>(() => ({
    async addTask(t) {
      const id = uid();
      await need().collection('tasks').doc(id).set(clean({ ...t, id: undefined, done: t.done ?? false, createdAt: new Date().toISOString() }));
      return id;
    },
    async updateTask(id, patch) {
      const p: Partial<Task> = { ...patch };
      if (patch.done === true) p.completedAt = new Date().toISOString();
      if (patch.done === false) (p as Record<string, unknown>).completedAt = null;
      await need().collection('tasks').doc(id).update(clean(p));
    },
    async deleteTask(id) {
      const t = data.tasks.find((x) => x.id === id);
      await need().collection('tasks').doc(id).delete();
      return t;
    },
    async restoreTask(t) { const { id, ...rest } = t; await need().collection('tasks').doc(id).set(clean(rest)); },
    async addNote(project, text) { const id = uid(); await need().collection('notes').doc(id).set({ project, text, createdAt: new Date().toISOString() }); },
    async deleteNote(id) { const n = data.notes.find((x) => x.id === id); await need().collection('notes').doc(id).delete(); return n; },
    async restoreNote(n) { const { id, ...rest } = n; await need().collection('notes').doc(id).set(clean(rest)); },
    async setStage(agentId, stage) {
      const prev = data.triage[agentId]?.stage ?? 'new';
      await need().collection('triage').doc(agentId).set({ stage, updatedAt: new Date().toISOString() });
      return prev;
    },
    async setProjectMeta(id, patch) { await need().collection('projectMeta').doc(id).set(clean({ ...(data.pmeta[id] ?? {}), ...patch, id: undefined })); },
    async addProject(p) {
      const id = p.repo.split('/').pop()!.replace(/[^A-Za-z0-9_\-.~:@+]/g, '-') || uid();
      await need().collection('rooms').doc(id).set({ name: p.name, repo: p.repo, order: data.projects.length + 1 });
      return id;
    },
    async saveSettings(s) { await need().doc('settings/app').set(clean(s)); },
    async exportFile(filename, text) {
      try {
        if (dlRef.current) { const r = await dlRef.current.save({ filename, data: text }); return r.status === 'saved' || r.status === 'delivered' ? 'saved' : 'failed'; }
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'cancelled' || code === 'declined') return 'failed';
      }
      try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
    },
  }), [data.tasks, data.notes, data.triage, data.pmeta, data.projects.length, need]);

  return <Ctx.Provider value={{ data, actions }}>{children}</Ctx.Provider>;
}

export function useOffice() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useOffice outside DataProvider');
  return c;
}
