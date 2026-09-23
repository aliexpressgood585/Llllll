import type { PaperState } from '../engine/engine';

const KEY = 'nexus-desk-paper-v1';

/** Paper-trading book survives page reloads (per browser). Best-effort: storage may be unavailable. */
export function loadPaperState(): PaperState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PaperState) : null;
  } catch {
    return null;
  }
}

export function savePaperState(s: PaperState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota / blocked storage: keep running in memory */
  }
}

export function clearPaperState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
