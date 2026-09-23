import { useCallback, useEffect, useRef, useState } from 'react';
import { FRAME_MS } from '../engine/config';
import { DeskEngine, DeskSnapshot } from '../engine/engine';
import { anchorToLiveIndex } from '../adapters/binancePublic';

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
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(4);

  useEffect(() => {
    if (import.meta.env.VITE_DATA_SOURCE === 'binance-public') {
      anchorToLiveIndex(engineRef.current!).then(() => setSnap(engineRef.current!.snapshot()));
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const e = engineRef.current!;
      for (let i = 0; i < speed; i++) e.step();
      setSnap(e.snapshot());
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [running, speed]);

  const toggle = useCallback(() => setRunning((r) => !r), []);
  const reset = useCallback(() => {
    engineRef.current = new DeskEngine();
    setSnap(engineRef.current.snapshot());
  }, []);

  return [snap, { running, speed, setSpeed, toggle, reset }];
}
