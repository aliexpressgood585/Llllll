import { useCallback, useEffect, useRef, useState } from 'react';
import { FRAME_MS } from '../engine/config';
import { DeskEngine, DeskSnapshot } from '../engine/engine';

export interface DeskControls {
  running: boolean;
  speed: number;
  setSpeed: (s: number) => void;
  toggle: () => void;
  reset: () => void;
}

/** Owns the engine instance and drives it on a real-time clock; returns an immutable snapshot per frame. */
export function useDesk(): [DeskSnapshot, DeskControls] {
  const engineRef = useRef<DeskEngine | null>(null);
  if (!engineRef.current) engineRef.current = new DeskEngine();
  const [snap, setSnap] = useState<DeskSnapshot>(() => engineRef.current!.snapshot());
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const e = engineRef.current!;
      for (let i = 0; i < speed; i++) e.step();
      const next = e.snapshot();
      if (next.blowup.active) setRunning(false);
      setSnap(next);
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [running, speed]);

  const toggle = useCallback(() => setRunning((r) => !r), []);
  const reset = useCallback(() => {
    engineRef.current = new DeskEngine();
    setSnap(engineRef.current.snapshot());
    setRunning(false);
  }, []);

  return [snap, { running, speed, setSpeed, toggle, reset }];
}

