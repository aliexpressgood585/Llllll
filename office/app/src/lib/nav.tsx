import { createContext, useContext } from 'react';
import type { Task } from './types';

export type Screen = 'dashboard' | 'house' | 'agents' | 'projects' | 'project' | 'board' | 'tasks' | 'docs' | 'reports' | 'goals';
export interface Route { screen: Screen; id?: string }

export const SCREENS: { id: Screen; label: string; icon: string; key: string }[] = [
  { id: 'dashboard', label: 'לוח בקרה', icon: 'dashboard', key: '1' },
  { id: 'board', label: 'לוח טיפול', icon: 'board', key: '2' },
  { id: 'tasks', label: 'משימות ולוח שנה', icon: 'tasks', key: '3' },
  { id: 'projects', label: 'פרויקטים', icon: 'folder', key: '4' },
  { id: 'agents', label: 'סוכנים', icon: 'agent', key: '5' },
  { id: 'docs', label: 'מסמכים', icon: 'file', key: '6' },
  { id: 'reports', label: 'דוחות', icon: 'chart', key: '7' },
  { id: 'house', label: 'הבית החי', icon: 'house', key: '8' },
  { id: 'goals', label: 'יעדים והגדרות', icon: 'target', key: '9' },
];

export interface NavApi {
  route: Route;
  go(r: Route): void;
  openAgent(id: string): void;
  editTask(prefill?: Partial<Task> & { id?: string }): void;
  quickAdd(kind?: 'task' | 'note' | 'project'): void;
  openPalette(): void;
}

export const NavCtx = createContext<NavApi | null>(null);
export function useNav() {
  const n = useContext(NavCtx);
  if (!n) throw new Error('useNav outside provider');
  return n;
}
