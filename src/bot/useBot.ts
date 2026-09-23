import { useCallback, useEffect, useState } from 'react';
import type { BotSnapshot } from '../../bot/snapshot';

export type { BotSnapshot };

/** Bot API base: same origin when the bot serves the dashboard, or VITE_BOT_URL, or localhost:8787 in dev. */
const BASE = import.meta.env.VITE_BOT_URL ?? (location.port === '5173' ? 'http://localhost:8787' : '');

export function useBot(active: boolean) {
  const [snap, setSnap] = useState<BotSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch(`${BASE}/api/state`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as BotSnapshot;
        if (!stop) {
          setSnap(j);
          setError(null);
        }
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const id = window.setInterval(load, 3000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [active]);

  const control = useCallback(async (action: 'resume' | 'halt' | 'closeAll') => {
    await fetch(`${BASE}/api/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
  }, []);

  return { snap, error, control };
}
