import type { DeskControls } from '../hooks/useDesk';
import type { DeskSnapshot } from '../engine/engine';
import { SPEEDS } from '../engine/config';
import { fmtNum, fmtPct, fmtSignedUsd, fmtTime, fmtUsd } from '../lib/format';
import { Dot } from './ui';

function Stat({ label, value, sub, tone = 'text-text', subTone }: { label: string; value: string; sub?: string; tone?: string; subTone?: string }) {
  return (
    <div className="flex min-w-[92px] flex-col justify-center border-s border-line px-3">
      <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className={`num text-[17px] font-semibold leading-tight ${tone}`}>{value}</span>
      {sub && <span className={`num text-[10.5px] ${subTone ?? tone}`}>{sub}</span>}
    </div>
  );
}

export function Header({ s, c }: { s: DeskSnapshot; c: DeskControls }) {
  const a = s.account;
  const tone = (v: number) => (v >= 0 ? 'text-up' : 'text-down');
  const src = s.source;
  const live = src.mode === 'live';
  const stateLabel = { sim: 'סימולציה', connecting: 'מתחבר…', live: `מחובר · ${src.latencyMs.toFixed(0)}ms`, stale: 'עיכוב בנתונים', error: 'שגיאה' }[src.state];
  const stateTone = src.state === 'live' ? 'text-up' : src.state === 'sim' ? 'text-warn' : src.state === 'error' ? 'text-down' : 'text-warn';
  const stateDot = src.state === 'live' ? 'bg-up' : src.state === 'error' ? 'bg-down' : 'bg-warn';
  return (
    <header className="flex flex-wrap items-stretch justify-between gap-y-2 rounded-[3px] border border-line bg-panel px-3 py-2">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 32 32" className="h-8 w-8 text-accent">
          <rect x="3" y="3" width="26" height="26" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 8l16 16M24 8L8 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-bold tracking-[0.04em] text-white">דסק אופציות נקסוס קוואנט</h1>
            <span className={`flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wider ${live ? 'border-up/30 bg-up/10 text-up' : 'border-warn/30 bg-warn/10 text-warn'}`}>
              <Dot pulse tone={live ? 'bg-up' : 'bg-warn'} /> {live ? 'נתונים חיים · מסחר על נייר' : 'סימולציה'}
            </span>
          </div>
          <div className="num text-[10px] text-muted">
            חשבון #{s.attempt} · הון התחלתי {fmtUsd(a.start)} · סיכון <span className="text-warn">מוגבל</span> · מחיקות <span className={s.blowups ? 'text-down' : 'text-dim'}>{s.blowups}</span> · חיסולים <span className={a.liqCount ? 'text-down' : 'text-dim'}>{a.liqCount}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-y-2">
        <div className="flex flex-col justify-center gap-0.5 border-s border-line px-3 text-[10px] font-semibold tracking-wider" title={src.detail}>
          <span className="text-muted">Deribit אופציות</span>
          <span className={`flex items-center gap-1 ${stateTone}`}><Dot tone={stateDot} pulse={src.state !== 'live'} /> {stateLabel}</span>
        </div>
        <div className="flex flex-col justify-center gap-0.5 border-s border-line px-3 text-[10px] font-semibold tracking-wider">
          <span className="text-muted">Binance חיסולים</span>
          <span className={`flex items-center gap-1 ${live && src.liqStream ? 'text-up' : 'text-muted'}`}><Dot tone={live && src.liqStream ? 'bg-up' : 'bg-muted'} /> {!live ? 'סימולציה' : src.liqStream ? 'מחובר' : 'מתחבר…'}</span>
        </div>
        <Stat label="הון החשבון" value={fmtUsd(a.equity, 2)} sub={`מזומן ${fmtUsd(a.cash)}`} tone="text-white" subTone="text-muted" />
        <Stat label="רווח/הפסד יומי" value={fmtPct(a.dayPnlPct, 2, true)} sub={fmtSignedUsd(a.dayPnl)} tone={tone(a.dayPnl)} />
        <Stat label="מאז הפתיחה" value={fmtPct(a.totalReturn, 1, true)} sub={fmtSignedUsd(a.totalPnl)} tone={tone(a.totalPnl)} />
        <Stat label="שארפ" value={a.sharpe === null ? '—' : fmtNum(a.sharpe, 2)} sub={`ר/ה ${a.wins}/${a.losses}`} tone="text-white" subTone="text-muted" />
        <Stat label="ירידה מקס׳" value={fmtPct(a.maxDD, 1)} sub={fmtSignedUsd(a.maxDDUsd)} tone="text-down" />
      </div>

      <div className="flex items-center gap-2 border-s border-line ps-3">
        <div className="flex overflow-hidden rounded-[3px] border border-line2">
          {(['live', 'sim'] as const).map((m) => (
            <button key={m} onClick={() => c.setMode(m)} className={`px-2 py-1 text-[10px] font-semibold ${c.mode === m ? 'bg-accent/20 text-accent' : 'text-muted hover:text-dim'}`}>
              {m === 'live' ? 'חי' : 'סימולציה'}
            </button>
          ))}
        </div>
        {!live && (<div className="flex overflow-hidden rounded-[3px] border border-line2">
          {SPEEDS.map((sp) => (
            <button key={sp} onClick={() => c.setSpeed(sp)} className={`num px-2 py-1 text-[10px] font-semibold ${c.speed === sp ? 'bg-accent/20 text-accent' : 'text-muted hover:text-dim'}`}>
              {sp * 240}x
            </button>
          ))}
        </div>)}
        <button onClick={c.toggle} aria-label={c.running ? 'השהה' : 'המשך'} title={c.running ? 'השהה' : 'המשך'} className="grid h-7 w-7 place-items-center rounded-[3px] border border-line2 text-dim hover:text-white">
          {c.running ? (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" /><rect x="9.5" y="2" width="3.5" height="12" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor"><path d="M4 2l10 6-10 6z" /></svg>
          )}
        </button>
        <button onClick={c.reset} aria-label={live ? 'איפוס ספר המסחר על נייר' : 'איפוס סימולציה'} title={live ? 'איפוס ספר המסחר על נייר' : 'סימולציה חדשה'} className="grid h-7 w-7 place-items-center rounded-[3px] border border-line2 text-dim hover:text-white">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3" /></svg>
        </button>
        <div className="ms-1 text-end">
          <div className="num text-[15px] font-semibold text-white">{fmtTime(s.now)} UTC</div>
          <div className="num text-[9.5px] text-muted">{new Date(s.now).toISOString().slice(0, 10)} · {live ? 'זמן אמת' : 'סים'}</div>
        </div>
      </div>
    </header>
  );
}

