import type { AgentStatus, Priority, ProjectStatus, TriageStage } from './types';

export const STATUS: Record<ProjectStatus, { he: string; short: string; tone: string; icon: string }> = {
  working: { he: 'עובד עכשיו', short: 'עובד', tone: 'working', icon: 'bolt' },
  needs_input: { he: 'מחכה לך', short: 'מחכה', tone: 'needs', icon: 'hand' },
  failed: { he: 'נתקע', short: 'נתקע', tone: 'failed', icon: 'alert' },
  review: { he: 'מוכן לבדיקה', short: 'לבדיקה', tone: 'review', icon: 'eye' },
  done: { he: 'הושלם', short: 'הושלם', tone: 'done', icon: 'check' },
  idle: { he: 'במנוחה', short: 'במנוחה', tone: 'idle', icon: 'moon' },
};

/** Order used to derive a project's headline status from its agents. */
export const STATUS_PRIORITY: AgentStatus[] = ['working', 'needs_input', 'failed', 'review', 'done'];
export const ATTENTION: AgentStatus[] = ['needs_input', 'failed', 'review'];

export const STAGES: { id: TriageStage; he: string; hint: string }[] = [
  { id: 'new', he: 'חדש', hint: 'עוד לא נגעת בזה' },
  { id: 'in_progress', he: 'בטיפול שלי', hint: 'אתה עובד על התשובה' },
  { id: 'waiting_agent', he: 'הועבר לסוכן', hint: 'ענית — הסוכן ממשיך' },
  { id: 'handled', he: 'טופל', hint: 'סגור מבחינתך' },
];

export const PRIORITY: Record<Priority, { he: string; rank: number }> = {
  high: { he: 'גבוהה', rank: 0 },
  medium: { he: 'בינונית', rank: 1 },
  low: { he: 'נמוכה', rank: 2 },
};

export const DOC_STATUS: Record<AgentStatus, string> = {
  needs_input: 'חסר קלט',
  failed: 'חסר קלט',
  working: 'בעבודה',
  review: 'לבדיקה',
  done: 'הושלם',
};
