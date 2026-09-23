import { useEffect, useState } from 'react';

/** UI preference kept in this viewer's browser (filters, sort, current screen). Survives storage being unavailable. */
export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`office:${key}`);
      if (!raw) return initial;
      const parsed = JSON.parse(raw) as T;
      const isObj = (x: unknown) => typeof x === 'object' && x !== null && !Array.isArray(x);
      return isObj(initial) && isObj(parsed) ? ({ ...(initial as object), ...(parsed as object) } as T) : parsed;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`office:${key}`, JSON.stringify(v));
    } catch {
      /* storage blocked: keep in memory */
    }
  }, [key, v]);
  return [v, setV];
}
