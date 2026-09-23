/**
 * The living house: a pixel-art canvas where every agent is a resident who works on their own.
 * World is 640×400 units, rendered at R device pixels per unit; residents are drawn PS× larger than the
 * furniture so each agent reads clearly. Name tags, bubbles and floats are DOM nodes over the canvas.
 */
import type { ProjectStatus } from '../lib/types';

export type Mode = 'auto' | 'status';
export type Labels = 'all' | 'attention' | 'none';
export interface Resident {
  id: string;
  kind: 'agent' | 'project';
  label: string;
  full: string;
  project: string;
  projectName: string;
  status: ProjectStatus;
  say?: string;
}
export interface LogEntry { key: number; t: number; id: string; who: string; text: string; real?: boolean }
export interface Activity { act: string; room: RoomKey; walking: boolean }

type RoomKey = 'work' | 'meet' | 'entry' | 'living' | 'repair' | 'attic';
type Floor = 'down' | 'up' | 'attic';
type Kind = 'code' | 'server' | 'talk' | 'break' | 'present' | 'meet' | 'door' | 'rest' | 'repair' | 'archive' | 'sleep';
type Pose = 'type' | 'sit' | 'stand' | 'coffee' | 'fridge' | 'knock' | 'wait' | 'bell' | 'hammer' | 'pace' | 'present' | 'sleep' | 'phone' | 'server' | 'search' | 'walk' | 'climb' | 'stretch';

interface Station { id: string; room: RoomKey; x: number; pose: Pose; face: 1 | -1; kind: Kind; act: string; dur: [number, number]; occ: string | null }
interface PathPt { x: number; y: number; floor: Floor; climb?: boolean }
interface Person {
  id: string; r: Resident; x: number; y: number; floor: Floor; face: 1 | -1; path: PathPt[];
  skin: string; hair: string; shirt: string; pants: string; style: number; glasses: boolean; phase: number;
  st: Station | null; free: { room: RoomKey; x: number; act: string } | null; timer: number; pose: Pose; roll: boolean; stretch: number;
}

const W = 640, H = 400, R = 2, PS = 1.5;
const FLOOR_Y: Record<Floor, number> = { attic: 84, up: 220, down: 366 };
export const ROOMS: Record<RoomKey, { he: string; floor: Floor; x0: number; x1: number; y0: number; y1: number }> = {
  work: { he: 'חדר העבודה', floor: 'up', x0: 30, x1: 390, y0: 94, y1: 222 },
  meet: { he: 'חדר הישיבות', floor: 'up', x0: 398, x1: 610, y0: 94, y1: 222 },
  entry: { he: 'הכניסה', floor: 'down', x0: 30, x1: 166, y0: 230, y1: 368 },
  living: { he: 'הסלון והמטבח', floor: 'down', x0: 218, x1: 466, y0: 230, y1: 368 },
  repair: { he: 'חדר התיקונים', floor: 'down', x0: 474, x1: 610, y0: 230, y1: 368 },
  attic: { he: 'עליית הגג', floor: 'attic', x0: 218, x1: 422, y0: 40, y1: 86 },
};
const STAIR = { bottom: 172, top: 214 };
const LADDER_X = 244;
const DESKS = [62, 112, 162, 290, 340];
const BEDS = [252, 300, 348, 396];

export const COLORS: Record<ProjectStatus, string> = { working: '#3ddc84', needs_input: '#ffcc33', failed: '#ff5a5f', review: '#5ab0ff', done: '#c9d1de', idle: '#9d8cf0' };

function stations(): Station[] {
  const s: Station[] = [];
  const add = (id: string, room: RoomKey, x: number, pose: Pose, face: 1 | -1, kind: Kind, act: string, dur: [number, number]) => s.push({ id, room, x, pose, face, kind, act, dur, occ: null });
  DESKS.forEach((d, i) => add(`desk${i}`, 'work', d - 12, 'type', 1, 'code', `כותב קוד בעמדה ${i + 1}`, [12, 24]));
  add('server', 'work', 250, 'server', 1, 'server', 'בודק את השרתים', [6, 11]);
  add('logs', 'work', 208, 'phone', -1, 'talk', 'קורא יומני ריצה בטלפון', [5, 9]);
  add('cooler', 'work', 358, 'coffee', 1, 'break', 'שותה מים ליד הקולר', [3, 6]);
  add('present', 'meet', 468, 'present', 1, 'present', 'מציג עבודה על הלוח', [9, 15]);
  [520, 548, 576, 600].forEach((x, i) => add(`seat${i}`, 'meet', x, 'sit', -1, 'meet', 'בישיבת צוות', [8, 14]));
  add('knock', 'entry', 60, 'knock', -1, 'door', 'דופק בדלת — מחכה לך', [3, 6]);
  add('wait1', 'entry', 98, 'wait', -1, 'door', 'מחכה לתשובה שלך', [4, 8]);
  add('wait2', 'entry', 126, 'wait', 1, 'door', 'מחכה לתשובה שלך', [4, 8]);
  add('bell', 'entry', 150, 'bell', 1, 'door', 'מצלצל בפעמון', [2, 4]);
  [262, 286, 310].forEach((x, i) => add(`sofa${i}`, 'living', x, 'sit', -1, 'rest', 'נח מול הטלוויזיה', [6, 11]));
  add('coffee1', 'living', 376, 'coffee', 1, 'break', 'מכין קפה', [4, 7]);
  add('coffee2', 'living', 420, 'coffee', 1, 'break', 'שותה קפה במטבח', [4, 7]);
  add('fridge', 'living', 440, 'fridge', 1, 'break', 'מחפש משהו במקרר', [2, 4]);
  add('plant', 'living', 238, 'stand', -1, 'break', 'משקה את העציץ', [3, 5]);
  add('hammer1', 'repair', 512, 'hammer', 1, 'repair', 'מתקן תקלה', [5, 9]);
  add('hammer2', 'repair', 548, 'hammer', 1, 'repair', 'מתקן תקלה', [5, 9]);
  add('pace1', 'repair', 590, 'pace', -1, 'repair', 'מסתובב וחושב על התקלה', [3, 5]);
  add('pace2', 'repair', 488, 'server', -1, 'repair', 'מריץ בדיקות על הכלים', [4, 7]);
  add('arch1', 'attic', 226, 'search', -1, 'archive', 'מחפש במסמכים ישנים בארכיון', [4, 8]);
  add('arch2', 'attic', 418, 'search', 1, 'archive', 'מחפש במסמכים ישנים בארכיון', [4, 8]);
  BEDS.forEach((x, i) => add(`bed${i}`, 'attic', x, 'sleep', 1, 'sleep', 'ישן — אין סוכן פעיל', [9999, 9999]));
  return s;
}

/** How each status spends its time. Autonomous: everyone keeps moving, weighted by what their status means. */
const AUTO: Record<ProjectStatus, Partial<Record<Kind, number>>> = {
  working: { code: 8, server: 2, talk: 1, break: 1, meet: 1 },
  needs_input: { door: 6, talk: 2, code: 1, break: 1 },
  failed: { repair: 6, server: 2, talk: 1, code: 1 },
  review: { present: 3, meet: 3, code: 2, break: 1 },
  done: { code: 3, server: 1, meet: 1, rest: 2, break: 2, archive: 1 },
  idle: { sleep: 1 },
};
const BY_STATUS: Record<ProjectStatus, Partial<Record<Kind, number>>> = {
  working: { code: 8, server: 1 },
  needs_input: { door: 1 },
  failed: { repair: 1 },
  review: { present: 1, meet: 2 },
  done: { rest: 2, break: 2 },
  idle: { sleep: 1 },
};
const HOME_ROOM: Record<ProjectStatus, RoomKey> = { working: 'work', needs_input: 'entry', failed: 'repair', review: 'meet', done: 'living', idle: 'attic' };
const KIND_ROOM: Record<Kind, RoomKey> = { code: 'work', server: 'work', talk: 'work', break: 'living', present: 'meet', meet: 'meet', door: 'entry', rest: 'living', repair: 'repair', archive: 'attic', sleep: 'attic' };

const SKIN = ['#f3c9a2', '#dca577', '#b07448', '#7d4b2c', '#f7dcc2', '#c98d5e'];
const HAIR = ['#2b1d12', '#6b3b1d', '#e0ad4a', '#161616', '#b8472c', '#ece6d6', '#3b5bd6', '#d05090'];
const SHIRT = ['#3a7bd5', '#e05d44', '#48a868', '#f0b44c', '#8e5bd0', '#2fb3b3', '#d64f8c', '#e4e4e4', '#ff8a3d', '#5ac8fa'];
const PANTS = ['#2c3550', '#3d2c22', '#1f2a2a', '#4a4f5c', '#23304a'];

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function px(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
function israel() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const hh = +(parts.find((q) => q.type === 'hour')?.value ?? 0) % 24, mm = +(parts.find((q) => q.type === 'minute')?.value ?? 0);
  return { hh, mm, f: hh + mm / 60 };
}
const isNight = () => { const f = israel().f; return f < 5.5 || f >= 19.5; };
function sky(f: number) {
  if (f >= 7 && f < 17) return ['#6fb7ff', '#c4e6ff'];
  if (f >= 17 && f < 19.5) return ['#3d3f88', '#f39a5b'];
  if (f >= 5.5 && f < 7) return ['#4b5fa8', '#f6c28b'];
  return ['#060a1d', '#1a2346'];
}
function route(from: { x: number; floor: Floor }, to: { x: number; floor: Floor }): PathPt[] {
  const pts: PathPt[] = []; let f = from.floor;
  const order: Floor[] = ['down', 'up', 'attic'];
  const go = (x: number, fl: Floor, climb?: boolean) => pts.push({ x, y: FLOOR_Y[fl], floor: fl, climb });
  let guard = 0;
  while (f !== to.floor && guard++ < 4) {
    const up = order.indexOf(to.floor) > order.indexOf(f);
    if (f === 'down') { go(STAIR.bottom, 'down'); go(STAIR.top, 'up'); f = 'up'; }
    else if (f === 'up' && !up) { go(STAIR.top, 'up'); go(STAIR.bottom, 'down'); f = 'down'; }
    else if (f === 'up') { go(LADDER_X, 'up'); go(LADDER_X, 'attic', true); f = 'attic'; }
    else { go(LADDER_X, 'attic'); go(LADDER_X, 'up', true); f = 'up'; }
  }
  go(to.x, to.floor);
  return pts;
}
const el = (t: string, c?: string, txt?: string) => { const e = document.createElement(t); if (c) e.className = c; if (txt !== undefined) e.textContent = txt; return e; };

export interface EngineOpts {
  scene: HTMLElement; cam: HTMLElement; canvas: HTMLCanvasElement; overlay: HTMLElement;
  onSelect(id: string): void;
  onLog(e: LogEntry): void;
}

export class HouseEngine {
  private ctx: CanvasRenderingContext2D;
  private bg = document.createElement('canvas');
  private b: CanvasRenderingContext2D;
  private st = stations();
  private people = new Map<string, Person>();
  private particles: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
  private tags = new Map<string, HTMLButtonElement>();
  private bubbles = new Map<string, { el: HTMLElement; until: number }>();
  private floats: { id: string; el: HTMLElement }[] = [];
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private night = false;
  private bgKey = '';
  private raf = 0;
  private last = performance.now();
  private t = 0;
  private bubbleT = 3;
  private logKey = 0;
  private started = false;
  private cam = { s: 1, cx: W / 2, cy: H / 2 };
  private camT = { s: 1, cx: W / 2, cy: H / 2 };
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  private suppressClick = false;
  private cat = { x: 300, tx: 300, wait: 3, face: 1 as 1 | -1, pose: 'walk' };
  mode: Mode = 'auto';
  labels: Labels = 'all';
  selected: string | null = null;
  follow = false;
  highlight = '';
  speed = 1;

  constructor(private o: EngineOpts) {
    o.canvas.width = W * R; o.canvas.height = H * R;
    this.ctx = o.canvas.getContext('2d')!;
    this.bg.width = W * R; this.bg.height = H * R;
    this.b = this.bg.getContext('2d')!;
    this.b.setTransform(R, 0, 0, R, 0, 0);
    this.roomSigns();
    this.bind();
    this.drawHouse();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.o.overlay.textContent = '';
    this.unbind();
  }

  /* ------------------------------------------------------------------ data */
  setResidents(list: Resident[]) {
    const ids = new Set(list.map((r) => r.id));
    for (const [id, p] of this.people) if (!ids.has(id)) { this.release(p); this.people.delete(id); }
    for (const r of list) {
      let p = this.people.get(r.id);
      if (!p) {
        const h = hash(r.id);
        p = {
          id: r.id, r, x: 44, y: FLOOR_Y.down, floor: 'down', face: 1, path: [],
          skin: SKIN[h % SKIN.length], hair: HAIR[(h >> 3) % HAIR.length], shirt: SHIRT[(h >> 6) % SHIRT.length], pants: PANTS[(h >> 9) % PANTS.length],
          style: (h >> 12) % 5, glasses: (h >> 15) % 4 === 0, phase: (h % 100) / 13, st: null, free: null, timer: 0, pose: 'stand', roll: false, stretch: 0,
        };
        this.people.set(r.id, p);
        this.plan(p, !this.started); // first load: everyone is already at a station; later arrivals walk in the front door
      } else if (p.r.status !== r.status) {
        const from = p.r.status;
        p.r = r;
        if (this.started) this.announce(p, from);
        p.timer = 0;
        if (!p.path.length) this.plan(p, false);
      } else p.r = r;
    }
    this.started = this.started || list.length > 0;
    this.buildTags();
  }

  setMode(m: Mode) { this.mode = m; for (const p of this.people.values()) { p.timer = Math.min(p.timer, rnd(0, 1.5)); } }
  setLabels(l: Labels) { this.labels = l; this.buildTags(); }
  setHighlight(project: string) { this.highlight = project; this.buildTags(); }
  select(id: string | null, focus = true) {
    this.selected = id; this.buildTags();
    const p = id ? this.people.get(id) : null;
    if (p && focus) { const s = Math.max(this.camT.s, 2.2); this.camT = { s, cx: p.x, cy: p.y - 30 }; }
  }
  zoom(f: number) { this.camT = { ...this.camT, s: Math.min(4, Math.max(1, this.camT.s * f)) }; }
  fit() { this.camT = { s: 1, cx: W / 2, cy: H / 2 }; this.follow = false; }
  activity(id: string): Activity | null {
    const p = this.people.get(id); if (!p) return null;
    const room = p.st?.room ?? p.free?.room ?? HOME_ROOM[p.r.status];
    const act = p.path.length ? `בדרך אל ${ROOMS[room].he}` : p.st?.act ?? p.free?.act ?? '';
    return { act, room, walking: p.path.length > 0 };
  }
  ids() { return [...this.people.keys()]; }

  /* ------------------------------------------------------------------ behaviour */
  private release(p: Person) { if (p.st && p.st.occ === p.id) p.st.occ = null; p.st = null; p.free = null; }

  private plan(p: Person, teleport: boolean) {
    const weights = (this.mode === 'auto' ? AUTO : BY_STATUS)[p.r.status];
    const prevKind = p.st?.kind;
    this.release(p);
    const kinds = (Object.entries(weights) as [Kind, number][]).map(([k, w]) => [k, k === prevKind && this.mode === 'auto' && k !== 'sleep' ? w * 0.35 : w] as [Kind, number]);
    let target: Station | null = null;
    const pool = [...kinds];
    while (pool.length && !target) {
      const total = pool.reduce((s, [, w]) => s + w, 0);
      let r = Math.random() * total, i = 0;
      for (; i < pool.length - 1; i++) { r -= pool[i][1]; if (r <= 0) break; }
      const kind = pool[i][0];
      const free = this.st.filter((s) => s.kind === kind && !s.occ);
      if (free.length) target = free[Math.floor(Math.random() * free.length)];
      else pool.splice(i, 1);
    }
    let x: number, floor: Floor;
    if (target) {
      target.occ = p.id; p.st = target; x = target.x; floor = ROOMS[target.room].floor;
    } else {
      // every spot of the right kind is taken: stand somewhere free in the room that fits the status
      const room = this.mode === 'auto' ? KIND_ROOM[kinds[0]?.[0] ?? 'break'] : HOME_ROOM[p.r.status];
      const rr = ROOMS[room];
      x = rnd(rr.x0 + 14, rr.x1 - 14); floor = rr.floor;
      p.free = { room, x, act: room === 'entry' ? 'מחכה לתשובה שלך' : room === 'repair' ? 'מחכה לתור בחדר התיקונים' : room === 'attic' ? 'ישן' : `מסתובב ב${rr.he}` };
    }
    if (teleport || this.reduced) { p.x = x; p.y = FLOOR_Y[floor]; p.floor = floor; p.path = []; this.arrive(p, teleport); }
    else { p.path = route({ x: p.x, floor: p.floor }, { x, floor }); p.timer = 0; }
  }

  private arrive(p: Person, quiet: boolean) {
    const s = p.st;
    if (s) { p.pose = s.pose; p.face = s.face; p.timer = rnd(s.dur[0], s.dur[1]); }
    else { p.pose = p.free?.room === 'attic' ? 'sleep' : p.free?.room === 'entry' ? 'wait' : 'stand'; p.timer = rnd(4, 8); }
    if (p.r.status === 'idle') p.timer = 9999;
    if (!quiet && p.r.kind === 'agent') {
      const act = s?.act ?? p.free?.act;
      if (act) this.o.onLog({ key: ++this.logKey, t: Date.now(), id: p.id, who: p.r.label, text: act });
    }
  }

  private announce(p: Person, from: ProjectStatus) {
    const to = p.r.status;
    const he: Record<ProjectStatus, string> = { working: 'עובד עכשיו', needs_input: 'מחכה לך', failed: 'נתקע', review: 'מוכן לבדיקה', done: 'הושלם', idle: 'במנוחה' };
    this.o.onLog({ key: ++this.logKey, t: Date.now(), id: p.id, who: p.r.label, text: `${he[from]} ← ${he[to]}`, real: true });
    this.spawnFloat(p, he[to], COLORS[to]);
    if (to === 'done') for (let i = 0; i < 40; i++) this.particles.push({ x: p.x, y: p.y - 30, vx: rnd(-40, 40), vy: rnd(-70, -20), life: rnd(1.2, 2.2), c: ['#ffcc33', '#3ddc84', '#5ab0ff', '#ff5a5f', '#f0b44c'][i % 5] });
  }

  private update(dt: number) {
    const speed = 34 * this.speed;
    for (const p of this.people.values()) {
      if (p.path.length) {
        const t = p.path[0];
        const dx = t.x - p.x, dy = t.y - p.y, dist = Math.hypot(dx, dy);
        const step = speed * dt * (t.climb ? 0.55 : 1);
        if (dist <= step) { p.x = t.x; p.y = t.y; p.floor = t.floor; p.path.shift(); if (!p.path.length) this.arrive(p, false); }
        else { p.x += (dx / dist) * step; p.y += (dy / dist) * step; if (Math.abs(dx) > 0.2) p.face = dx > 0 ? 1 : -1; }
        p.pose = t.climb ? 'climb' : 'walk';
        continue;
      }
      p.timer -= dt * this.speed;
      if (p.pose === 'type' || p.pose === 'stretch') {
        if (p.stretch > 0) { p.stretch -= dt; p.pose = p.stretch > 0 ? 'stretch' : 'type'; }
        else if (!this.reduced && Math.random() < dt * 0.03) { p.stretch = 1.6; p.pose = 'stretch'; }
      }
      if (p.pose === 'sleep' && Math.random() < dt * 0.1) p.roll = !p.roll;
      if (p.pose === 'hammer' && !this.reduced && Math.random() < dt * 3) for (let i = 0; i < 3; i++) this.particles.push({ x: p.x + 14 * p.face, y: p.y - 20, vx: rnd(-20, 30), vy: rnd(-40, -10), life: rnd(0.3, 0.6), c: '#ffd76a' });
      if (p.timer <= 0) this.plan(p, false);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) { const q = this.particles[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 90 * dt; if (q.life <= 0) this.particles.splice(i, 1); }
    // cat
    const c = this.cat; c.wait -= dt;
    if (this.night) c.tx = 286;
    if (Math.abs(c.tx - c.x) > 1 && !this.reduced) { c.x += Math.sign(c.tx - c.x) * 18 * dt; c.face = (Math.sign(c.tx - c.x) || c.face) as 1 | -1; c.pose = 'walk'; }
    else { c.pose = this.night ? 'sleep' : 'sit'; if (c.wait <= 0 && !this.night) { c.tx = rnd(40, 600); c.wait = rnd(4, 9); } }
    // occasional speech bubbles with what the agent is really about
    this.bubbleT -= dt;
    const now = performance.now();
    for (const [id, bb] of this.bubbles) if (bb.until < now || !this.people.has(id)) { bb.el.remove(); this.bubbles.delete(id); }
    if (this.bubbleT <= 0 && this.labels !== 'none') {
      this.bubbleT = rnd(3, 5);
      const cands = [...this.people.values()].filter((p) => !p.path.length && p.r.say && p.r.kind === 'agent' && !this.bubbles.has(p.id) && p.id !== this.selected && (!this.highlight || p.r.project === this.highlight));
      if (cands.length && this.bubbles.size < 3) {
        const p = cands[Math.floor(Math.random() * cands.length)];
        const say = p.r.say!.length > 72 ? p.r.say!.slice(0, 70) + '…' : p.r.say!;
        const e = el('div', `hb${p.r.status === 'needs_input' || p.r.status === 'failed' ? ' hb-need' : ''}`);
        e.append(el('b', '', p.r.label), document.createTextNode(say));
        this.o.overlay.append(e);
        this.bubbles.set(p.id, { el: e, until: now + 6500 });
      }
    }
  }

  /* ------------------------------------------------------------------ drawing */
  private drawHouse() {
    const b = this.b;
    const { f, hh } = israel(); const night = (this.night = isNight()); this.bgKey = `${hh}`;
    const [top, bot] = sky(f);
    const g = b.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bot); b.fillStyle = g; b.fillRect(0, 0, W, H);
    if (night) { for (let i = 0; i < 90; i++) { const h = hash('s' + i); px(b, h % W, (h >> 9) % 150, 1, 1, i % 6 ? '#c9d3ff' : '#ffffff'); } px(b, 560, 22, 14, 14, '#f5efcf'); px(b, 565, 21, 10, 10, top); }
    b.fillStyle = night ? '#101a2c' : '#8cc38a'; b.beginPath(); b.moveTo(0, 330); for (let x = 0; x <= W; x += 16) b.lineTo(x, 318 - Math.sin(x / 70) * 14); b.lineTo(W, 372); b.lineTo(0, 372); b.fill();
    px(b, 0, 372, W, 28, night ? '#1b3620' : '#3f8f3e'); px(b, 0, 372, W, 3, night ? '#264d2c' : '#5bb452');
    for (let i = 0; i < 60; i++) { const h = hash('g' + i); px(b, h % W, 377 + ((h >> 8) % 20), 2, 1, night ? '#2a5731' : '#4fa546'); }
    px(b, 20, 376, 40, 6, night ? '#3a3a40' : '#b9b3a3');
    const tree = (x: number) => { px(b, x + 7, 320, 5, 52, '#5b3a22'); px(b, x, 282, 19, 42, night ? '#1d4526' : '#2f7a3a'); px(b, x + 3, 274, 13, 10, night ? '#235330' : '#3a9147'); px(b, x + 4, 300, 3, 3, night ? '#2a5c34' : '#4caa56'); };
    tree(0); tree(620);
    b.fillStyle = night ? '#431f1f' : '#8e3b2e';
    b.beginPath(); b.moveTo(10, 92); b.lineTo(320, 8); b.lineTo(630, 92); b.closePath(); b.fill();
    for (let y = 16; y < 92; y += 7) { const half = ((y - 8) / 84) * 310; px(b, 320 - half, y, half * 2, 1, night ? '#361818' : '#6f2b21'); }
    px(b, 478, 26, 18, 40, '#6c6c74'); px(b, 475, 23, 24, 5, '#55555c');
    px(b, 24, 90, 592, 282, '#2a2118');
    b.fillStyle = night ? '#2a2118' : '#b89a6a'; b.beginPath(); b.moveTo(188, 88); b.lineTo(320, 30); b.lineTo(452, 88); b.closePath(); b.fill();
    px(b, 206, 84, 228, 4, '#5a4128');
    px(b, 313, 46, 14, 14, night ? '#ffd76a' : '#9ad0ff'); px(b, 319, 46, 2, 14, '#5a4128'); px(b, 313, 52, 14, 2, '#5a4128');
    const room = (r: { x0: number; x1: number; y0: number; y1: number }, day: string, dark: string) => px(b, r.x0 - 2, r.y0, r.x1 - r.x0 + 4, r.y1 - r.y0, night ? dark : day);
    room(ROOMS.work, '#d3e3f2', '#34405a'); room(ROOMS.meet, '#e7dbf4', '#3f3553'); room(ROOMS.entry, '#f2e1c1', '#463927');
    px(b, 168, 230, 48, 138, night ? '#3a3025' : '#dcc9a2'); room(ROOMS.living, '#f6d9ba', '#47372a'); room(ROOMS.repair, '#d0d7de', '#353b42');
    for (const r of Object.values(ROOMS)) { if (r.floor === 'attic') continue; for (let x = r.x0; x < r.x1; x += 10) px(b, x, r.y0 + 4, 1, r.y1 - r.y0 - 30, 'rgba(0,0,0,0.035)'); px(b, r.x0 - 2, r.y1 - 26, r.x1 - r.x0 + 4, 2, 'rgba(0,0,0,0.12)'); }
    const floor = (x0: number, y: number, x1: number, col: string) => { px(b, x0, y, x1 - x0, 6, col); for (let x = x0; x < x1; x += 14) px(b, x, y, 1, 6, 'rgba(0,0,0,0.25)'); };
    floor(26, 220, 614, '#8a5a36'); floor(26, 366, 614, '#7a4e2f');
    px(b, 24, 224, 592, 6, '#2a2118');
    px(b, 392, 94, 6, 128, '#2a2118'); px(b, 466, 230, 8, 138, '#2a2118'); px(b, 166, 230, 4, 138, '#2a2118');
    px(b, 392, 170, 6, 50, night ? '#34405a' : '#d3e3f2'); px(b, 466, 316, 8, 50, night ? '#47372a' : '#f6d9ba');
    const win = (x: number, y: number, w: number, h: number) => { px(b, x - 2, y - 2, w + 4, h + 4, '#5a4128'); px(b, x, y, w, h, night ? '#ffd76a' : '#a5d8ff'); if (!night) px(b, x + 2, y + 2, 4, h - 4, 'rgba(255,255,255,0.45)'); px(b, x + w / 2 - 1, y, 2, h, '#5a4128'); px(b, x, y + h / 2 - 1, w, 2, '#5a4128'); px(b, x - 3, y + h + 2, w + 6, 3, '#6d4a2d'); };
    win(206, 114, 26, 22); win(556, 112, 30, 22); win(372, 252, 26, 22); win(118, 250, 24, 20); win(586, 254, 20, 20);
    for (let i = 0; i < 12; i++) px(b, 170 + i * 3.6, 360 - i * 11.6, 10, 5, '#6b4a2c');
    for (let i = 0; i < 12; i += 2) px(b, 176 + i * 3.6, 344 - i * 11.6, 1, 16, '#3a2a1a');
    px(b, LADDER_X - 6, 86, 2, 134, '#7a5534'); px(b, LADDER_X + 4, 86, 2, 134, '#7a5534'); for (let y = 92; y < 218; y += 9) px(b, LADDER_X - 6, y, 12, 2, '#7a5534');
    // work room
    px(b, 34, 110, 52, 34, '#efeadb'); px(b, 34, 108, 52, 3, '#8a8f98');
    ([['#3ddc84', 6], ['#5ab0ff', 4], ['#f0b44c', 5]] as [string, number][]).forEach(([c, n], col) => { for (let i = 0; i < n; i++) px(b, 38 + col * 16, 114 + i * 5, 12, 3, c); });
    px(b, 256, 104, 26, 34, night ? '#2a3244' : '#8fa2b8'); for (let i = 0; i < 4; i++) { px(b, 259, 108 + i * 7, 20, 5, night ? '#141a26' : '#dbe7f2'); px(b, 275, 109 + i * 7, 2, 2, i % 2 ? '#3ddc84' : '#5ab0ff'); }
    px(b, 368, 186, 12, 34, '#e9edf2'); px(b, 366, 172, 16, 16, '#9fd3ff'); px(b, 369, 196, 6, 3, '#5ab0ff');
    px(b, 300, 120, 20, 16, '#6aa36a'); px(b, 302, 118, 16, 3, '#3a2a1a');
    for (const x of DESKS) {
      px(b, x - 4, 192, 34, 4, '#b9895a'); px(b, x - 2, 196, 3, 24, '#7d5836'); px(b, x + 25, 196, 3, 24, '#7d5836');
      px(b, x + 4, 172, 20, 15, '#1b2230'); px(b, x + 12, 187, 4, 5, '#1b2230'); px(b, x + 3, 190, 22, 2, '#4a5263');
      px(b, x + 26, 186, 4, 6, '#e8e8e8'); px(b, x - 3, 186, 6, 6, '#48a868'); px(b, x - 1, 183, 2, 3, '#2f7a3a');
      px(b, x - 18, 204, 12, 4, '#34507a'); px(b, x - 16, 186, 3, 20, '#2a3b58'); px(b, x - 13, 208, 2, 12, '#2a3b58');
    }
    // meeting room
    px(b, 426, 114, 110, 50, '#f6f6f2'); px(b, 424, 112, 114, 3, '#8a8f98'); px(b, 424, 164, 114, 4, '#8a8f98');
    px(b, 434, 122, 30, 3, '#5ab0ff'); px(b, 434, 130, 46, 3, '#5ab0ff'); px(b, 434, 138, 36, 3, '#e05d44'); px(b, 434, 146, 24, 3, '#48a868');
    px(b, 494, 120, 34, 34, '#dcebff'); [8, 14, 22, 28].forEach((hgt, i) => px(b, 498 + i * 7, 150 - hgt, 5, hgt, '#3ddc84'));
    px(b, 504, 196, 104, 5, '#6d4a2d'); px(b, 510, 201, 4, 19, '#4f3620'); px(b, 598, 201, 4, 19, '#4f3620');
    px(b, 520, 190, 6, 6, '#e8e8e8'); px(b, 560, 191, 10, 4, '#f4f4f0'); px(b, 584, 190, 5, 6, '#e8e8e8');
    // entry
    px(b, 30, 298, 30, 68, '#6d4125'); px(b, 33, 301, 24, 62, '#8a5530'); px(b, 36, 306, 18, 22, '#9a6038'); px(b, 36, 334, 18, 24, '#9a6038'); px(b, 52, 330, 3, 3, '#f0b44c');
    px(b, 70, 348, 80, 5, '#8a5530'); px(b, 72, 353, 4, 13, '#5a3a22'); px(b, 144, 353, 4, 13, '#5a3a22'); px(b, 70, 342, 80, 3, '#a8703f');
    px(b, 156, 290, 10, 9, '#f0b44c'); px(b, 160, 285, 2, 5, '#a8761f');
    px(b, 78, 262, 34, 22, '#fff4cc'); px(b, 80, 264, 30, 3, '#ffcc33'); px(b, 82, 270, 24, 2, '#b8860b'); px(b, 82, 275, 18, 2, '#b8860b');
    px(b, 64, 282, 3, 40, '#5a3a22'); px(b, 60, 282, 11, 3, '#5a3a22'); px(b, 58, 286, 5, 10, '#3a7bd5');
    // living & kitchen
    px(b, 226, 360, 150, 6, night ? '#5e2a36' : '#b5485d'); for (let x = 230; x < 372; x += 8) px(b, x, 361, 4, 1, night ? '#7a3848' : '#d06a7c');
    px(b, 246, 334, 86, 18, '#4063a8'); px(b, 240, 326, 10, 30, '#34528c'); px(b, 328, 326, 10, 30, '#34528c'); px(b, 246, 326, 86, 10, '#4a70bb'); px(b, 252, 356, 4, 10, '#2a3b58'); px(b, 322, 356, 4, 10, '#2a3b58');
    px(b, 262, 270, 58, 34, '#15181f'); px(b, 266, 304, 4, 8, '#15181f'); px(b, 312, 304, 4, 8, '#15181f'); px(b, 258, 312, 66, 3, '#6d4a2d');
    px(b, 224, 322, 10, 44, '#8a5530'); px(b, 220, 304, 18, 20, '#2f7a3a'); px(b, 223, 296, 12, 10, '#3a9147');
    px(b, 390, 326, 64, 40, '#c7cbd1'); px(b, 390, 320, 64, 7, '#8a8f98'); px(b, 396, 334, 14, 26, '#b0b5bc'); px(b, 416, 334, 14, 26, '#b0b5bc');
    px(b, 414, 302, 14, 18, '#2e2e33'); px(b, 417, 306, 8, 5, '#e05d44'); px(b, 419, 314, 4, 3, '#e8e8e8');
    px(b, 434, 306, 10, 14, '#f4f4f0'); px(b, 398, 308, 12, 12, '#f0b44c');
    px(b, 446, 262, 18, 104, '#e9edf2'); px(b, 446, 300, 18, 1, '#8a8f98'); px(b, 460, 280, 2, 12, '#8a8f98'); px(b, 460, 306, 2, 16, '#8a8f98');
    px(b, 346, 254, 18, 18, '#3a2a1a'); px(b, 348, 256, 14, 14, '#fbf6e8');
    // repair
    px(b, 484, 336, 94, 5, '#6d4a2d'); px(b, 488, 341, 4, 25, '#4f3620'); px(b, 570, 341, 4, 25, '#4f3620');
    px(b, 528, 312, 26, 22, '#1b2230'); px(b, 531, 315, 20, 15, '#3a1216'); for (let i = 0; i < 5; i++) { px(b, 536 + i * 2, 317 + i * 2, 2, 2, '#ff5a5f'); px(b, 544 - i * 2, 317 + i * 2, 2, 2, '#ff5a5f'); }
    px(b, 492, 324, 24, 12, '#c0392b'); px(b, 498, 320, 12, 4, '#8e2a20');
    px(b, 596, 332, 8, 22, '#e0312b'); px(b, 597, 328, 6, 4, '#2a2a2a');
    px(b, 484, 262, 60, 4, '#6d4a2d'); px(b, 488, 250, 8, 12, '#6c7a89'); px(b, 500, 254, 10, 8, '#b0b5bc'); px(b, 516, 252, 6, 10, '#f0b44c'); px(b, 528, 256, 12, 6, '#48a868');
    px(b, 560, 262, 30, 20, '#ffeb99'); px(b, 563, 266, 24, 2, '#b8860b'); px(b, 563, 271, 18, 2, '#b8860b');
    // attic
    for (const x of BEDS) { px(b, x - 18, 76, 34, 8, '#7a5534'); px(b, x - 16, 70, 30, 7, '#e9e4d6'); px(b, x - 16, 70, 8, 7, '#ffffff'); px(b, x - 18, 66, 3, 18, '#5a4128'); }
    px(b, 214, 72, 14, 12, '#a67b4b'); px(b, 418, 70, 14, 14, '#a67b4b'); px(b, 420, 74, 10, 2, '#7a5534');
    px(b, 24, 366, 592, 6, '#2a2118');
  }

  private drawDynamic(t: number) {
    const ctx = this.ctx, reduced = this.reduced, night = this.night;
    const ppl = [...this.people.values()];
    if (!night) for (let i = 0; i < 4; i++) { const cx = ((t * (4 + i) + i * 190) % (W + 120)) - 60, cy = 20 + i * 13; px(ctx, cx, cy, 30, 6, 'rgba(255,255,255,0.85)'); px(ctx, cx + 6, cy - 4, 16, 5, 'rgba(255,255,255,0.85)'); }
    else if (!reduced) for (let i = 0; i < 8; i++) { const h = hash('tw' + i); if (Math.floor(t * 2 + i) % 5 === 0) px(ctx, h % W, (h >> 9) % 140, 1, 1, '#ffffff'); }
    DESKS.forEach((x, i) => {
      const busy = ppl.some((p) => p.st?.id === `desk${i}` && !p.path.length);
      px(ctx, x + 6, 174, 16, 11, busy ? '#0f2c22' : '#0e1320');
      if (busy) for (let r = 0; r < 3; r++) { const w = 4 + ((Math.floor(t * 5) + r * 3 + x) % 9); px(ctx, x + 7, 176 + r * 3, w, 1, r === 1 ? '#5ab0ff' : '#3ddc84'); }
    });
    // server rack blinkenlights when someone works on it
    if (ppl.some((p) => (p.st?.id === 'server') && !p.path.length) && !reduced) for (let i = 0; i < 4; i++) px(ctx, 275, 109 + i * 7, 2, 2, Math.floor(t * 6 + i) % 2 ? '#3ddc84' : '#ffcc33');
    const watching = ppl.some((p) => p.st?.room === 'living' && p.pose === 'sit');
    const tvc = ['#2d4d7a', '#3a5f8a', '#4a6f3a', '#7a4a3a', '#3a3f8a'][Math.floor(t * 1.5) % 5];
    px(ctx, 265, 273, 52, 28, watching && !reduced ? tvc : '#1d2a3c');
    if (watching) px(ctx, 270, 294, 12, 3, 'rgba(255,255,255,0.35)');
    if (!reduced) { const s = (t * 1.3) % 1; px(ctx, 420, 298 - s * 10, 2, 2, `rgba(255,255,255,${0.7 - s * 0.6})`); }
    if (ppl.some((p) => p.pose === 'fridge' && !p.path.length)) { px(ctx, 464, 262, 10, 38, '#f4f7fb'); px(ctx, 447, 263, 16, 36, '#ffffe0'); }
    if (ppl.some((p) => p.r.status === 'failed')) for (let i = 0; i < 4; i++) { const s = reduced ? 0.4 : (t * 0.5 + i / 4) % 1; px(ctx, 536 + i * 3 + s * 8, 306 - s * 34, 5, 5, `rgba(150,150,160,${0.7 - s * 0.7})`); }
    for (let i = 0; i < 4; i++) { const s = reduced ? 0.3 : (t * 0.22 + i / 4) % 1; px(ctx, 482 + s * 18, 18 - s * 22, 7, 5, `rgba(225,225,235,${0.5 - s * 0.5})`); }
    if (ppl.some((p) => p.pose === 'bell' && !p.path.length) && !reduced && Math.floor(t * 6) % 2) { px(ctx, 152, 288, 2, 2, '#ffcc33'); px(ctx, 168, 288, 2, 2, '#ffcc33'); px(ctx, 150, 294, 2, 1, '#ffcc33'); px(ctx, 170, 294, 2, 1, '#ffcc33'); }
    const { hh, mm } = israel();
    const cx = 355, cy = 263, ha = (((hh % 12) + mm / 60) / 12) * Math.PI * 2, ma = (mm / 60) * Math.PI * 2;
    for (let i = 0; i <= 4; i++) px(ctx, cx + Math.sin(ha) * i, cy - Math.cos(ha) * i, 1, 1, '#1b1b1b');
    for (let i = 0; i <= 6; i++) px(ctx, cx + Math.sin(ma) * i, cy - Math.cos(ma) * i, 1, 1, '#e05d44');
  }

  private drawCat(t: number) {
    const c = this.cat, ctx = this.ctx;
    const x = Math.round(c.x), y = Math.round(this.night ? FLOOR_Y.down - 10 : FLOOR_Y.down);
    const f = c.face;
    const P = (dx: number, dy: number, w: number, h: number, col: string) => px(ctx, f > 0 ? x + dx : x - dx - w, y + dy, w, h, col);
    if (c.pose === 'sleep') { P(-5, -3, 9, 3, '#e08a3a'); P(-6, -4, 3, 2, '#e08a3a'); return; }
    const leg = c.pose === 'walk' && Math.floor(t * 8) % 2;
    P(-4, -5, 8, 3, '#e08a3a'); P(3, -7, 3, 3, '#e08a3a'); P(3, -8, 1, 1, '#e08a3a'); P(5, -8, 1, 1, '#e08a3a'); P(5, -6, 1, 1, '#1b1b1b');
    P(-4, -2, 1, 2 - (leg ? 1 : 0), '#c06a22'); P(2, -2, 1, 2 - (leg ? 0 : 1), '#c06a22');
    P(-6, -8 + (Math.floor(t * 3) % 2), 2, 4, '#e08a3a');
  }

  private drawPerson(p: Person, t: number) {
    const ctx = this.ctx;
    const x = Math.round(p.x), y = Math.round(p.y), f = p.face;
    // scale the sprite PS× around its feet so residents read clearly against the furniture
    ctx.setTransform(R * PS, 0, 0, R * PS, -x * R * (PS - 1), -y * R * (PS - 1));
    ctx.globalAlpha = this.highlight && p.r.project !== this.highlight ? 0.28 : 1;
    const P = (dx: number, dy: number, w: number, h: number, c: string) => px(ctx, f > 0 ? x + dx : x - dx - w, y + dy, w, h, c);
    const pose = p.pose, reduced = this.reduced, tick = reduced ? 0 : t;
    const sc = COLORS[p.r.status];
    if (pose === 'sleep') {
      const hx = p.roll ? -14 : 6;
      px(ctx, x + hx, y - 17, 8, 6, p.skin); px(ctx, x + hx, y - 18, 8, 2, p.hair);
      px(ctx, x - 6, y - 16, 16, 6, p.shirt); px(ctx, x - 6, y - 16, 16, 2, '#f4f0e4');
      if (!reduced) { const z = Math.floor(t * 1.1 + p.phase) % 3; for (let i = 0; i <= z; i++) { const zx = x + hx + 8 + i * 5, zy = y - 24 - i * 6; px(ctx, zx, zy, 4, 1, '#ffffff'); px(ctx, zx + 2, zy + 1, 1, 1, '#ffffff'); px(ctx, zx + 1, zy + 2, 1, 1, '#ffffff'); px(ctx, zx, zy + 3, 4, 1, '#ffffff'); } }
      this.drawSelected(p, y - 30, t);
      ctx.globalAlpha = 1;
      return;
    }
    const sitting = pose === 'type' || pose === 'sit' || pose === 'stretch';
    const walkF = pose === 'walk' || pose === 'pace' ? Math.floor(tick * 8 + p.phase) % 4 : 0;
    const bob = pose === 'walk' && (walkF === 1 || walkF === 3) ? -1 : 0;
    px(ctx, x - 6, y - 1, 12, 2, 'rgba(0,0,0,0.22)');
    px(ctx, x - 5, y + 1, 10, 1, sc); // status ring under the feet
    if (sitting) { P(-3, -8, 9, 3, p.pants); P(4, -8, 3, 8, p.pants); P(4, -1, 4, 1, '#1b1b1b'); }
    else if (pose === 'climb') { const c = Math.floor(tick * 6 + p.phase) % 2; P(-3, -7 + c, 3, 7 - c, p.pants); P(1, -7 + (1 - c), 3, 7 - (1 - c), p.pants); }
    else if (pose === 'search') { P(-3, -5, 3, 5, p.pants); P(1, -5, 3, 5, p.pants); }
    else {
      const a = walkF === 1 ? 2 : walkF === 3 ? -2 : 0;
      P(-3 + a, -6, 3, 6, p.pants); P(1 - a, -6, 3, 6, p.pants);
      P(-3 + a, -1, 4, 1, '#1b1b1b'); P(1 - a, -1, 4, 1, '#1b1b1b');
    }
    const top = sitting ? -22 : pose === 'search' ? -19 : -21 + bob;
    P(-4, top + 8, 9, 8, p.shirt); P(-4, top + 15, 9, 1, 'rgba(0,0,0,0.2)');
    P(-4, top, 8, 8, p.skin);
    const hs = p.style;
    if (hs === 0) { P(-4, top - 1, 8, 3, p.hair); P(-4, top + 2, 2, 3, p.hair); }
    else if (hs === 1) { P(-5, top - 1, 10, 3, p.hair); P(-5, top + 2, 3, 8, p.hair); }
    else if (hs === 2) { P(-4, top - 1, 8, 3, p.hair); P(-2, top - 4, 4, 3, p.hair); }
    else if (hs === 3) { P(-4, top - 2, 8, 3, p.shirt); P(-4, top - 2, 8, 1, 'rgba(255,255,255,0.3)'); P(3, top, 3, 1, p.shirt); }
    else P(-4, top, 8, 2, p.hair);
    P(2, top + 3, 1, 1, '#1b1b1b');
    if (p.glasses) { P(0, top + 3, 4, 1, '#1b1b1b'); P(1, top + 2, 2, 1, 'rgba(255,255,255,0.5)'); }
    P(1, top + 6, 2, pose === 'present' && Math.floor(tick * 6) % 2 ? 2 : 1, '#8a3a2a');
    const arm = (dx: number, dy: number, w: number, h: number) => P(dx, dy, w, h, p.shirt);
    const hand = (dx: number, dy: number) => P(dx, dy, 2, 2, p.skin);
    const k = Math.floor(tick * 10 + p.phase) % 2;
    switch (pose) {
      case 'type': arm(4, top + 10, 5, 2); hand(9, top + 10 + k); break;
      case 'server': arm(4, top + 9, 6, 2); hand(10, top + 9 + k); break;
      case 'stretch': arm(-5, top - 4, 2, 12); arm(4, top - 4, 2, 12); hand(-5, top - 6); hand(4, top - 6); break;
      case 'present': { const a = Math.floor(tick * 1.4 + p.phase) % 2; arm(4, top + 4 - a * 3, 2, 8); hand(5, top + 2 - a * 3); P(6, top + 1 - a * 3, 5, 1, '#6d4a2d'); break; }
      case 'coffee': arm(4, top + 11, 4, 2); P(7, top + 9, 4, 5, '#f4f4f4'); P(10, top + 10, 1, 2, '#f4f4f4'); if (!reduced && Math.floor(t * 2 + p.phase) % 3 === 0) P(8, top + 4, 1, 4, 'rgba(255,255,255,0.7)'); break;
      case 'fridge': arm(4, top + 8, 7, 2); hand(10, top + 8); break;
      case 'knock': { const a = Math.floor(tick * 5 + p.phase) % 2; arm(4, top + 8 - a, 5, 2); hand(9, top + 7 - a); break; }
      case 'bell': { const a = Math.floor(tick * 4 + p.phase) % 2; arm(4, top + 6, 2, 7); hand(4 + a, top + 4); break; }
      case 'hammer': { const a = Math.floor(tick * 6 + p.phase) % 2; arm(4, top + 8 - a * 4, 2, 7); P(5, top + 4 - a * 5, 2, 6, '#6d4a2d'); P(3, top + 3 - a * 5, 6, 3, '#8a8f98'); break; }
      case 'phone': arm(3, top + 5, 2, 7); P(2, top + 2, 2, 5, '#1b1b1b'); P(2, top + 3, 1, 2, '#5ab0ff'); break;
      case 'search': arm(4, top + 11, 4, 2); P(7, top + 11, 7, 6, '#a67b4b'); P(7, top + 11, 7, 1, '#7a5534'); break;
      case 'pace': arm(-5, top + 9, 2, 6); arm(4, top + 9, 2, 6); break;
      default: arm(4, top + 9, 2, 7); hand(4, top + 16);
    }
    // status marks above the head
    const by = y + top - 14;
    if (p.r.status === 'needs_input' && (reduced || Math.floor(t * 2 + p.phase) % 4 !== 3)) {
      px(ctx, x - 5, by, 11, 11, '#fff4cc'); px(ctx, x - 5, by, 11, 1, '#ffcc33'); px(ctx, x - 5, by + 10, 11, 1, '#e0b000'); px(ctx, x - 1, by + 11, 3, 2, '#fff4cc');
      px(ctx, x, by + 2, 1, 5, '#8a6400'); px(ctx, x, by + 8, 1, 1, '#8a6400');
    } else if (p.r.status === 'failed') {
      px(ctx, x - 5, by + 1, 11, 10, '#ffe1e1'); px(ctx, x - 5, by + 1, 11, 1, '#ff5a5f'); px(ctx, x - 2, by + 3, 1, 1, '#b3261e'); px(ctx, x + 2, by + 3, 1, 1, '#b3261e');
      px(ctx, x - 1, by + 4, 3, 3, '#b3261e'); px(ctx, x - 2, by + 7, 1, 1, '#b3261e'); px(ctx, x + 2, by + 7, 1, 1, '#b3261e');
      if (!reduced && Math.floor(t * 3 + p.phase) % 2) px(ctx, x + (f > 0 ? -6 : 5), y + top + 1, 2, 3, '#7fd0ff');
    } else if (p.r.status === 'working' && !p.path.length && pose !== 'walk' && !reduced) {
      const s = Math.floor(t * 3 + p.phase) % 3; // little bolts of progress
      px(ctx, x - 1 + s, by + 6 - s * 2, 2, 2, '#3ddc84');
    }
    this.drawSelected(p, y + top - (p.r.status === 'needs_input' || p.r.status === 'failed' ? 22 : 8), t);
    ctx.globalAlpha = 1;
  }

  private drawSelected(p: Person, ay0: number, t: number) {
    if (this.selected !== p.id) return;
    const ctx = this.ctx, x = Math.round(p.x);
    const ay = ay0 + (this.reduced ? 0 : Math.round(Math.sin(t * 4) * 1.5));
    px(ctx, x - 2, ay - 3, 5, 2, '#f0b44c'); px(ctx, x - 1, ay - 1, 3, 2, '#f0b44c'); px(ctx, x, ay + 1, 1, 1, '#f0b44c');
  }

  private lighting() {
    if (!this.night) return;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(6, 10, 30, 0.28)'; ctx.fillRect(26, 92, 588, 276);
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x: number, y: number, r: number, a: number) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255, 200, 110, ${a})`); g.addColorStop(1, 'rgba(255,200,110,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
    for (const x of DESKS) glow(x + 14, 180, 26, 0.18);
    glow(290, 290, 40, 0.14); glow(480, 150, 50, 0.12); glow(100, 290, 40, 0.14); glow(540, 300, 34, 0.12); glow(320, 60, 30, 0.1);
    ctx.globalCompositeOperation = 'source-over';
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (`${israel().hh}` !== this.bgKey) this.drawHouse();
    this.update(dt);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(R, 0, 0, R, 0, 0);
    this.drawDynamic(this.t);
    const list = [...this.people.values()].sort((a, c) => a.y - c.y || a.x - c.x);
    for (const p of list) this.drawPerson(p, this.t);
    ctx.setTransform(R, 0, 0, R, 0, 0);
    this.drawCat(this.t);
    for (const q of this.particles) px(ctx, q.x, q.y, 2, 2, q.c);
    this.lighting();
    this.stepCamera(dt);
    this.positionOverlay();
    this.raf = requestAnimationFrame(this.frame);
  };

  /* ------------------------------------------------------------------ camera */
  private stepCamera(dt: number) {
    if (this.follow && this.selected) { const p = this.people.get(this.selected); if (p) this.camT = { ...this.camT, cx: p.x, cy: p.y - 30 }; }
    const k = this.reduced || this.drag ? 1 : 1 - Math.exp(-dt * 5);
    const c = this.cam, T = this.camT;
    c.s += (T.s - c.s) * k; c.cx += (T.cx - c.cx) * k; c.cy += (T.cy - c.cy) * k;
    let tx = W / 2 - c.cx * c.s, ty = H / 2 - c.cy * c.s;
    tx = Math.min(0, Math.max(W - W * c.s, tx)); ty = Math.min(0, Math.max(H - H * c.s, ty));
    this.o.cam.style.transform = `translate(${(tx / W) * 100}%, ${(ty / H) * 100}%) scale(${c.s})`;
    this.o.cam.style.setProperty('--z', c.s.toFixed(3));
  }

  private onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.htag')) return;
    this.drag = { x: e.clientX, y: e.clientY, cx: this.camT.cx, cy: this.camT.cy, moved: false };
  };
  private onMove = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (this.cam.s <= 1.01) return; // nothing to pan at full view
    d.moved = true; this.follow = false;
    const scale = W / this.o.scene.clientWidth / this.cam.s;
    this.camT = { ...this.camT, cx: d.cx - dx * scale, cy: d.cy - dy * scale };
  };
  private onUp = () => { if (this.drag?.moved) this.suppressClick = true; this.drag = null; };
  private worldPoint(e: MouseEvent) {
    const r = this.o.canvas.getBoundingClientRect();
    return { mx: ((e.clientX - r.left) / r.width) * W, my: ((e.clientY - r.top) / r.height) * H };
  }
  private onClick = (e: MouseEvent) => {
    if (this.suppressClick) { this.suppressClick = false; return; }
    const { mx, my } = this.worldPoint(e);
    let best: Person | null = null, bd = 20;
    for (const p of this.people.values()) { const d = Math.hypot(p.x - mx, p.y - 16 - my); if (d < bd) { bd = d; best = p; } }
    if (best) { this.select(best.id, false); this.o.onSelect(best.id); }
  };
  private onDbl = (e: MouseEvent) => {
    const { mx, my } = this.worldPoint(e);
    this.camT = { s: Math.min(4, this.camT.s * 1.6), cx: mx, cy: my };
  };
  private bind() {
    const s = this.o.scene;
    s.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    this.o.canvas.addEventListener('click', this.onClick);
    this.o.canvas.addEventListener('dblclick', this.onDbl);
  }
  private unbind() {
    this.o.scene.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp);
    this.o.canvas.removeEventListener('click', this.onClick);
    this.o.canvas.removeEventListener('dblclick', this.onDbl);
  }

  /* ------------------------------------------------------------------ overlay */
  private roomSigns() {
    const signs: [RoomKey, number, number][] = [['work', 210, 96], ['meet', 504, 96], ['entry', 98, 232], ['living', 342, 232], ['repair', 542, 232], ['attic', 320, 32]];
    for (const [k, x, y] of signs) { const s = el('div', 'hsign', ROOMS[k].he); s.style.right = `${100 - (x / W) * 100}%`; s.style.top = `${(y / H) * 100}%`; this.o.overlay.append(s); }
  }
  private tagVisible(p: Person) {
    if (this.highlight && p.r.project !== this.highlight) return false;
    if (this.labels === 'none') return p.id === this.selected;
    if (this.labels === 'attention') return p.id === this.selected || p.r.status === 'needs_input' || p.r.status === 'failed';
    return true;
  }
  private buildTags() {
    for (const [id, tg] of this.tags) if (!this.people.has(id)) { tg.remove(); this.tags.delete(id); }
    const he: Record<ProjectStatus, string> = { working: 'עובד עכשיו', needs_input: 'מחכה לך', failed: 'נתקע', review: 'מוכן לבדיקה', done: 'הושלם', idle: 'במנוחה' };
    for (const p of this.people.values()) {
      let tg = this.tags.get(p.id);
      if (!tg) {
        tg = el('button', 'htag') as HTMLButtonElement; tg.type = 'button';
        const id = p.id;
        tg.addEventListener('click', () => { this.select(id, false); this.o.onSelect(id); });
        this.o.overlay.append(tg); this.tags.set(p.id, tg);
      }
      tg.textContent = p.r.label;
      tg.style.setProperty('--c', COLORS[p.r.status]);
      tg.setAttribute('aria-label', `${p.r.full} · ${p.r.projectName} — ${he[p.r.status]}`);
      tg.classList.toggle('sel', this.selected === p.id);
      tg.hidden = !this.tagVisible(p);
    }
  }
  private headOffset(p: Person) { return p.pose === 'sleep' ? 36 : p.r.status === 'needs_input' || p.r.status === 'failed' ? 58 : 38; }
  private positionOverlay() {
    const cw = Math.max(1, this.o.canvas.clientWidth);
    const byRow: Record<number, Person[]> = {};
    for (const p of this.people.values()) { const tg = this.tags.get(p.id); if (tg && !tg.hidden) (byRow[Math.round(p.y / 40)] ??= []).push(p); }
    const levels = new Map<string, number>();
    for (const list of Object.values(byRow)) {
      list.sort((a, c) => a.x - c.x);
      const lastX: number[] = [];
      for (const p of list) {
        const tg = this.tags.get(p.id)!;
        const w = (tg.offsetWidth / cw) * W + 2;
        let lv = 0; while (lastX[lv] !== undefined && p.x - w < lastX[lv]) lv++;
        lastX[lv] = p.x; levels.set(p.id, lv);
      }
    }
    const lineH = (tg?: HTMLElement) => (tg ? (tg.offsetHeight / cw) * W : 10) + 1;
    for (const p of this.people.values()) {
      const tg = this.tags.get(p.id); if (!tg || tg.hidden) continue;
      const lv = levels.get(p.id) || 0;
      const half = (tg.offsetWidth / cw) * W / 2 + 1; // keep the tag inside the house edges
      const tx = Math.min(W - half, Math.max(half, p.x));
      tg.style.right = `${100 - (tx / W) * 100}%`;
      tg.style.top = `${Math.max(0, ((p.y - this.headOffset(p) - lv * lineH(tg)) / H) * 100)}%`;
      tg.style.zIndex = String(30 - lv);
    }
    for (const [id, bb] of this.bubbles) {
      const p = this.people.get(id); if (!p) continue;
      const tg = this.tags.get(id);
      const lv = levels.get(id) ?? 0;
      const off = this.headOffset(p) + (tg && !tg.hidden ? (lv + 1) * lineH(tg) : 0) + 3;
      bb.el.style.right = `${100 - (p.x / W) * 100}%`;
      bb.el.style.top = `${Math.max(0, ((p.y - off) / H) * 100)}%`;
    }
    for (const fl of this.floats) { const p = this.people.get(fl.id); if (p) { fl.el.style.right = `${100 - (p.x / W) * 100}%`; fl.el.style.top = `${((p.y - this.headOffset(p) - 18) / H) * 100}%`; } }
  }
  private spawnFloat(p: Person, text: string, color: string) {
    const e = el('div', 'hfloat', text); e.style.color = color; this.o.overlay.append(e);
    const item = { id: p.id, el: e }; this.floats.push(item);
    setTimeout(() => { e.remove(); this.floats.splice(this.floats.indexOf(item), 1); }, 3300);
  }
}
