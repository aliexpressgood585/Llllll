import { useCallback, useEffect, useRef, useState } from 'react';
import { FRAME_MS, SIM_MINUTES_PER_STEP } from '../engine/config';
import { DeskEngine, DeskSnapshot } from '../engine/engine';
import { BinanceLiquidationStream } from '../live/binanceLiquidations';
import { DeribitWsClient } from '../live/deribitClient';
import { LiveMarket } from '../live/liveMarket';
import { loadPaperState, savePaperState, clearPaperState } from '../live/persistence';

export type DataMode = 'sim' | 'live';

export interface DeskControls {
  running: boolean;
  speed: number;
  mode: DataMode;
  /** live connection failed and the desk fell back to simulation */
  fallbackReason: string | null;
  connecting: boolean;
  setSpeed: (s: number) => void;
  setMode: (m: DataMode) => void;
  toggle: () => void;
  reset: () => void;
}

const LIVE_STEP_MS = SIM_MINUTES_PER_STEP * 60e3;
const LIVE_FRAME_MS = 1000;

function initialMode(): DataMode {
  const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
  if (h === 'live' || h === 'sim') return h;
  return import.meta.env.VITE_DATA_SOURCE === 'sim' ? 'sim' : 'live';
}

/** Owns the engine: sim mode runs sim-time steps; live mode trades on paper against Deribit + Binance data in wall time. */
export function useDesk(): [DeskSnapshot, DeskControls] {
  const engineRef = useRef<DeskEngine | null>(null);
  if (!engineRef.current) engineRef.current = new DeskEngine();
  const [snap, setSnap] = useState<DeskSnapshot>(() => engineRef.current!.snapshot());
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(4);
  const [mode, setModeState] = useState<DataMode>(initialMode);
  const [connecting, setConnecting] = useState(mode === 'live');
  const [fallbackReason, setFallback] = useState<string | null>(null);
  const liveRef = useRef<{ market: LiveMarket; liqs: BinanceLiquidationStream; lastStep: number } | null>(null);

  // connect / disconnect live data when the mode changes
  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false;
    setConnecting(true);
    setFallback(null);
    const market = new LiveMarket(new DeribitWsClient());
    const liqs = new BinanceLiquidationStream(market.onLiquidation);
    market.liqStreamConnected = () => liqs.connected;
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('תם הזמן לחיבור ל-Deribit (25 שניות)')), 25000));
    Promise.race([market.init(), timeout])
      .then(() => {
        if (cancelled) return;
        liqs.start();
        const engine = new DeskEngine({ market });
        const saved = loadPaperState();
        if (saved) engine.importState(saved);
        engine.step();
        engineRef.current = engine;
        liveRef.current = { market, liqs, lastStep: Date.now() };
        setSnap(engine.snapshot());
        setConnecting(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        market.stop();
        const msg = e instanceof Error ? e.message : String(e);
        setFallback(`הנתונים החיים לא זמינים (${msg}) — מוצגת סימולציה`);
        setConnecting(false);
        setModeState('sim');
      });
    return () => {
      cancelled = true;
      const l = liveRef.current;
      if (l) {
        l.market.stop();
        l.liqs.stop();
        liveRef.current = null;
      }
      market.stop();
      liqs.stop();
    };
  }, [mode]);

  // sim mode: fresh synthetic engine
  useEffect(() => {
    if (mode !== 'sim') return;
    engineRef.current = new DeskEngine();
    setSnap(engineRef.current.snapshot());
  }, [mode]);

  useEffect(() => {
    if (!running || connecting) return;
    const live = mode === 'live';
    const id = window.setInterval(
      () => {
        const e = engineRef.current!;
        if (live) {
          const l = liveRef.current;
          if (!l) return;
          if (Date.now() - l.lastStep >= LIVE_STEP_MS) {
            l.lastStep = Date.now();
            e.step();
            savePaperState(e.exportState());
          }
        } else {
          for (let i = 0; i < speed; i++) e.step();
        }
        setSnap(e.snapshot());
      },
      live ? LIVE_FRAME_MS : FRAME_MS,
    );
    return () => window.clearInterval(id);
  }, [running, speed, mode, connecting]);

  const toggle = useCallback(() => setRunning((r) => !r), []);
  const setMode = useCallback((m: DataMode) => {
    try {
      history.replaceState(null, '', `#${m}`);
    } catch {
      /* ignore */
    }
    setModeState(m);
  }, []);
  const reset = useCallback(() => {
    if (mode === 'live' && liveRef.current) {
      clearPaperState();
      const engine = new DeskEngine({ market: liveRef.current.market });
      engine.step();
      engineRef.current = engine;
      setSnap(engine.snapshot());
      return;
    }
    engineRef.current = new DeskEngine();
    setSnap(engineRef.current.snapshot());
  }, [mode]);

  return [snap, { running, speed, mode, fallbackReason, connecting, setSpeed, setMode, toggle, reset }];
}
