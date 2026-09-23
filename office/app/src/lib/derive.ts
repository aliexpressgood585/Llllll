import { ATTENTION, STATUS_PRIORITY } from './constants';
import { daysSince, todayISO } from './format';
import type { Agent, Project, ProjectStatus, Task, TriageStage } from './types';
import type { OfficeData } from './store';

export interface ProjectView {
  project: Project;
  agents: Agent[];
  status: ProjectStatus;
  last?: string;
  cost: number;
  attention: number;
  openTasks: number;
  followUp?: string;
}

export function projectViews(d: OfficeData): ProjectView[] {
  return d.projects.map((project) => {
    const agents = d.agents
      .filter((a) => a.project === project.id)
      .sort((x, y) => STATUS_PRIORITY.indexOf(x.status) - STATUS_PRIORITY.indexOf(y.status) || String(y.updatedAt).localeCompare(String(x.updatedAt)));
    const status: ProjectStatus = agents[0]?.status ?? 'idle';
    const last = agents.reduce<string | undefined>((m, a) => (!m || a.updatedAt > m ? a.updatedAt : m), undefined);
    return {
      project,
      agents,
      status,
      last,
      cost: agents.reduce((s, a) => s + (a.costUsd ?? 0), 0),
      attention: agents.filter((a) => ATTENTION.includes(a.status) && stageOf(d, a.id) !== 'handled').length,
      openTasks: d.tasks.filter((t) => t.project === project.id && !t.done).length,
      followUp: d.pmeta[project.id]?.followUp,
    };
  });
}

export const stageOf = (d: OfficeData, agentId: string): TriageStage => d.triage[agentId]?.stage ?? 'new';

/** Items that need you: agent needs input / is stuck, and you haven't marked it handled. */
export function waitingOnYou(d: OfficeData): Agent[] {
  return d.agents
    .filter((a) => (a.status === 'needs_input' || a.status === 'failed') && stageOf(d, a.id) !== 'handled')
    .sort((x, y) => String(x.updatedAt).localeCompare(String(y.updatedAt))); // oldest first
}

export const projectName = (d: OfficeData, id?: string) => d.projects.find((p) => p.id === id)?.name ?? id ?? '';

export function taskBuckets(tasks: Task[]) {
  const t = todayISO();
  const open = tasks.filter((x) => !x.done);
  return {
    overdue: open.filter((x) => x.due && x.due < t),
    today: open.filter((x) => x.due === t),
    week: open.filter((x) => x.due && x.due > t && x.due <= todayISO(7)),
    open,
  };
}

export type Period = 7 | 30 | 90 | 0;
export const inPeriod = (iso: string | undefined, p: Period) => !!iso && (p === 0 || daysSince(iso) <= p);

/** Agent activity per day (by last update) for the chart. */
export function activityByDay(agents: Agent[], days: number) {
  const out: { day: string; count: number; label: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = todayISO(-i);
    out.push({ day: iso, count: 0, label: new Date(`${iso}T12:00:00`).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) });
  }
  const idx = new Map(out.map((o, i) => [o.day, i]));
  for (const a of agents) {
    const d = new Date(a.updatedAt);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const i = idx.get(iso);
    if (i !== undefined) out[i].count++;
  }
  return out;
}

export function tasksDoneByWeek(tasks: Task[], weeks: number) {
  const out: { label: string; count: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = Date.now() - w * 7 * 86400000;
    const start = end - 7 * 86400000;
    out.push({
      label: w === 0 ? 'השבוע' : w === 1 ? 'שבוע שעבר' : `לפני ${w} שב׳`,
      count: tasks.filter((t) => t.done && t.completedAt && +new Date(t.completedAt) > start && +new Date(t.completedAt) <= end).length,
    });
  }
  return out;
}

export function goals(d: OfficeData) {
  const waiting = waitingOnYou(d);
  const oldest = waiting.length ? daysSince(waiting[0].updatedAt) : 0;
  const doneThisWeek = d.tasks.filter((t) => t.done && t.completedAt && daysSince(t.completedAt) <= 7).length;
  const s = d.settings;
  return [
    { id: 'waiting', label: 'פריטים שמחכים לך', value: waiting.length, target: s.maxWaiting, ok: waiting.length <= s.maxWaiting, fmt: `${waiting.length} / עד ${s.maxWaiting}`, progress: Math.min(1, s.maxWaiting / Math.max(1, waiting.length)) },
    { id: 'wait', label: 'ההמתנה הארוכה ביותר', value: oldest, target: s.maxWaitDays, ok: oldest <= s.maxWaitDays, fmt: `${Math.round(oldest)} ימים / עד ${s.maxWaitDays}`, progress: Math.min(1, s.maxWaitDays / Math.max(0.01, oldest || 0.01)) },
    { id: 'tasks', label: 'משימות שהושלמו השבוע', value: doneThisWeek, target: s.weeklyTasks, ok: doneThisWeek >= s.weeklyTasks, fmt: `${doneThisWeek} / ${s.weeklyTasks}`, progress: Math.min(1, doneThisWeek / Math.max(1, s.weeklyTasks)) },
  ];
}

export function toCsv(rows: (string | number | undefined)[][]): string {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}
