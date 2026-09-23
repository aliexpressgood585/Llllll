/** Data model of the agent office. Collections live in the artifact database (claude.use('db')). */

export type AgentStatus = 'working' | 'needs_input' | 'failed' | 'review' | 'done';
export type ProjectStatus = AgentStatus | 'idle';
/** How far *you* have handled an item that needs attention (Kanban column). */
export type TriageStage = 'new' | 'in_progress' | 'waiting_agent' | 'handled';
export type Priority = 'high' | 'medium' | 'low';

export interface Project {
  id: string;
  name: string;
  repo: string;
  order?: number;
  note?: string;
}

export interface ArtifactLink {
  title: string;
  url: string;
}

export interface Agent {
  id: string;
  project: string;
  name: string;
  status: AgentStatus;
  detail?: string;
  needsAction?: string;
  model?: string;
  updatedAt: string;
  costUsd?: number;
  url?: string;
  artifacts?: ArtifactLink[];
}

export interface Task {
  id: string;
  title: string;
  project?: string;
  agentId?: string;
  priority: Priority;
  due?: string; // YYYY-MM-DD
  done: boolean;
  createdAt: string;
  completedAt?: string;
  remind?: boolean;
  source?: 'agent' | 'manual';
}

export interface Note {
  id: string;
  project: string;
  text: string;
  createdAt: string;
  pinned?: boolean;
}

export interface Triage {
  id: string; // agent id
  stage: TriageStage;
  updatedAt: string;
}

export interface ProjectMeta {
  id: string; // project id
  followUp?: string; // YYYY-MM-DD
  priority?: Priority;
}

export interface Settings {
  maxWaiting: number; // goal: at most N items waiting on you
  maxWaitDays: number; // goal: nothing waits longer than N days
  weeklyTasks: number; // goal: tasks completed per week
}

export interface Meta {
  updatedAt?: string;
  source?: string;
}

export const DEFAULT_SETTINGS: Settings = { maxWaiting: 3, maxWaitDays: 3, weeklyTasks: 10 };
