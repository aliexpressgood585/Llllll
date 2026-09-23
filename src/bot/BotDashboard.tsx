import { useElementSize } from '../hooks/useElementSize';
import { fmtCompactUsd, fmtNum, fmtPct, fmtSignedUsd, fmtUsd } from '../lib/format';
import { Chip, Panel, Row, Tile } from '../components/ui';
import { useBot, type BotSnapshot } from './useBot';

const STRAT: Record<string, string> = { LONG_STRADDLE: 'לונג סטראדל', LONG_CALL: 'לונג קול', LONG_PUT: 'לונג פוט' };
const tone = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-dim');
const t = (ms: number) => new Date(ms).toISOString().slice(5, 16).replace('T', ' ');
const age = (ms: number) => {
  const h = (Date.now() - ms) / 3600e3;
  return h < 1 ? `${Math.round(h * 60)} דק׳` : h < 48 ? `${h.toFixed(1)} ש׳` : `${(h / 24).toFixed(1)} ימים`;
};

function EquityChart({ s }: { s: BotSnapshot }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const pts = s.equity;
  const W = Math.max(60, size.width);
  const H = 170;
  if (pts.length < 2) return <div ref={ref} className="grid h-[170px] place-items-center text-[11px] text-muted">העקומה תתחיל להצטבר אחרי הדקות הראשונות</div>;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const vals = pts.map((p) => p.equity).concat(s.portfolio.capital);
  const lo = Math.min(...vals) * 0.995;
  const hi = Math.max(...vals) * 1.005;
  const X = (x: number) => 50 + ((x - t0) / Math.max(1, t1 - t0)) * (W - 54);
  const Y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H - 24);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.equity).toFixed(1)}`).join('');
  const up = s.portfolio.equityBid >= s.portfolio.capital;
  return (
    <div ref={ref} dir="ltr">
      <svg width={W} height={H} className="block">
        {[0, 0.5, 1].map((f) => {
          const v = lo + (hi - lo) * f;
          return (
            <g key={f}>
              <line x1={50} x2={W} y1={Y(v)} y2={Y(v)} stroke="#131c26" />
              <text x={2} y={Y(v) + 3} fontSize="9" fill="#5f6f82" fontFamily="JetBrains Mono, monospace">{fmtCompactUsd(v)}</text>
            </g>
          );
        })}
        <line x1={50} x2={W} y1={Y(s.portfolio.capital)} y2={Y(s.portfolio.capital)} stroke="#5f6f82" strokeDasharray="3 3" />
        <path d={`${d}L${X(t1)},${H - 18}L${X(t0)},${H - 18}Z`} fill={up ? 'rgba(46,230,182,0.12)' : 'rgba(255,77,94,0.12)'} />
        <path d={d} fill="none" stroke={up ? '#2ee6b6' : '#ff4d5e'} strokeWidth={1.5} />
        <text x={50} y={H - 4} fontSize="9" fill="#5f6f82" fontFamily="JetBrains Mono, monospace">{t(t0)}</text>
        <text x={W - 70} y={H - 4} fontSize="9" fill="#5f6f82" fontFamily="JetBrains Mono, monospace">{t(t1)}</text>
      </svg>
    </div>
  );
}

function Spark({ v }: { v: number[] }) {
  if (v.length < 2) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * 100).toFixed(1)},${(28 - ((x - lo) / (hi - lo || 1)) * 26).toFixed(1)}`).join('');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-7 w-full">
      <path d={d} fill="none" stroke={v[v.length - 1] >= v[0] ? '#1fd69a' : '#ff4d5e'} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ReportPanel({ s }: { s: BotSnapshot }) {
  const r = s.report;
  const progress = Math.min(1, r.days / 7);
  return (
    <Panel
      title="דוח תקופת הבדיקה — האם לחבר לכסף אמיתי?"
      right={<span className={`rounded-sm px-2 py-0.5 text-[11px] font-bold ${r.passed ? 'bg-up/20 text-up' : r.days < 7 ? 'bg-warn/15 text-warn' : 'bg-down/20 text-down'}`}>{r.passed ? 'עבר' : r.days < 7 ? 'בתהליך' : 'לא עבר'}</span>}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr_1fr]">
        <div>
          <div className="text-[11px] text-dim">התקדמות: {r.days.toFixed(1)} מתוך 7 ימים</div>
          <div className="my-1.5 h-2 overflow-hidden rounded-sm bg-line"><div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} /></div>
          <div className="num mt-2 text-[22px] font-semibold text-white">
            {fmtUsd(r.capital)} <span className="text-muted">←</span> {fmtUsd(r.endEquity, 2)}
          </div>
          <div className={`num text-[15px] font-semibold ${tone(r.pnl)}`}>{fmtSignedUsd(r.pnl, 2)} ({fmtPct(r.pnlPct, 2, true)})</div>
          <div className="mt-1 text-[11px] text-dim">אחרי כל העמלות ({fmtUsd(r.fees, 2)}) · שווי לפי מחיר ביד — מה שאפשר למכור בפועל</div>
          <div className={`mt-3 text-[12px] font-semibold ${r.passed ? 'text-up' : r.days < 7 ? 'text-warn' : 'text-down'}`}>{r.verdict}</div>
        </div>
        <div>
          {r.checks.map((c) => (
            <div key={c.label} className="flex items-start justify-between gap-2 py-[3px] text-[11.5px]">
              <span className={c.ok ? 'text-up' : 'text-muted'}>{c.ok ? '✓' : '○'} {c.label}</span>
              <span className={`num shrink-0 ${c.ok ? 'text-text' : 'text-dim'}`}>{c.value}</span>
            </div>
          ))}
        </div>
        <div className="max-h-[190px] overflow-auto">
          <table className="num w-full text-[11px]">
            <thead className="text-[10px] text-muted"><tr><th className="text-start font-semibold">יום</th><th className="text-end font-semibold">שווי</th><th className="text-end font-semibold">רו״ה</th></tr></thead>
            <tbody>
              {r.daily.map((d) => (
                <tr key={d.day} className="border-t border-line/60">
                  <td className="py-[3px] text-dim">{d.day}</td>
                  <td className="text-end">{fmtUsd(d.equity, 2)}</td>
                  <td className={`text-end ${tone(d.pnl)}`}>{fmtSignedUsd(d.pnl, 2)} ({fmtPct(d.pct, 1, true)})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

export function BotDashboard() {
  const { snap: s, error, control } = useBot(true);

  if (!s) {
    return (
      <Panel title="בוט אופציות Binance · לא מחובר">
        <div className="space-y-3 text-[12.5px] leading-relaxed text-dim">
          <p className="text-warn">{error ? `אין חיבור לשרת הבוט (${error}).` : 'מתחבר לשרת הבוט…'}</p>
          <p>הבוט רץ כתהליך נפרד שמתחבר ל-Binance, סוחר ומגיש את הדשבורד הזה. כדי להפעיל אותו על המחשב שלך או על שרת:</p>
          <pre dir="ltr" className="overflow-x-auto rounded-[3px] border border-line bg-panel2 p-3 text-start text-[12px] text-text">{`npm ci
npm run build
npm run bot        # ואז לפתוח http://localhost:8787`}</pre>
          <p>ברירת המחדל היא מסחר על נייר: נתוני אמת מ-Binance וביצוע מדומה מול ספר הפקודות האמיתי, בלי כסף אמיתי. Binance חוסמת כתובות IP מארה״ב, אז צריך להריץ מאזור נתמך.</p>
        </div>
      </Panel>
    );
  }

  const p = s.portfolio;
  const st = s.status;
  const live = s.mode === 'live';
  const fresh = st.dataAgeMs < 45000;
  return (
    <div className="flex flex-col gap-2">
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-[3px] border border-line bg-panel px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded-sm px-2 py-0.5 font-bold ${live ? 'bg-down text-white' : 'border border-up/40 bg-up/10 text-up'}`}>{live ? 'מסחר אמיתי' : 'מסחר על נייר · נתוני אמת Binance'}</span>
          <span className={fresh ? 'text-up' : 'text-down'}>● נתונים {fresh ? 'עדכניים' : 'מיושנים'} ({Math.round(st.dataAgeMs / 1000)} שנ׳)</span>
          <span className="text-dim">{st.contracts} חוזים · {st.quotes} ציטוטים</span>
          <span className="text-dim">משקל API {st.weightUsed}/דקה</span>
          <span className={st.liqStream ? 'text-up' : 'text-muted'}>● זרם חיסולים {st.liqStream ? 'מחובר' : 'מנותק'}</span>
          {st.halted && <span className="rounded-sm bg-down px-2 py-0.5 font-semibold text-white">עצור: {st.haltReason}</span>}
          {!st.halted && st.entriesPausedUntil > Date.now() && <span className="text-warn">כניסות מושהות עד {t(st.entriesPausedUntil)} UTC</span>}
        </div>
        <div className="flex gap-1">
          {st.halted ? <Chip onClick={() => control('resume')}>חידוש מסחר</Chip> : <Chip onClick={() => control('halt')}>עצירת כניסות</Chip>}
          <Chip onClick={() => { if (window.confirm('לסגור את כל הפוזיציות במחירי השוק?')) void control('closeAll'); }}>סגירת הכל</Chip>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
        <Tile label="תיק קבוע" value={fmtUsd(p.capital)} sub={`מאז ${t(p.startedAt)}`} />
        <Tile label="שווי (לפי ביד)" value={fmtUsd(p.equityBid, 2)} sub={`לפי מארק ${fmtUsd(p.equityMark, 2)}`} tone="text-white" />
        <Tile label="רווח/הפסד כולל" value={fmtPct(p.pnlPct, 2, true)} sub={fmtSignedUsd(p.pnl, 2)} tone={tone(p.pnl)} />
        <Tile label="היום (UTC)" value={fmtSignedUsd(p.dayPnl, 2)} tone={tone(p.dayPnl)} />
        <Tile label="מזומן" value={fmtUsd(p.cash, 2)} sub={`פרמיה פתוחה ${fmtPct(p.openPremiumPct, 1)}`} />
        <Tile label="ירידה מהשיא" value={fmtPct(-p.drawdown, 1)} sub={`מקס׳ ${fmtPct(-p.maxDD, 1)}`} tone={p.drawdown > 0.1 ? 'text-down' : 'text-dim'} />
        <Tile label="עסקאות / הצלחה" value={`${p.trades} · ${fmtPct(p.winRate, 0)}`} sub={`PF ${p.profitFactor === null ? '—' : fmtNum(p.profitFactor, 2)} · שארפ ${p.sharpe === null ? '—' : fmtNum(p.sharpe, 2)}`} />
        <Tile label="עמלות ששולמו" value={fmtUsd(p.feesPaid, 2)} sub="מסחר + מימוש" tone="text-warn" />
      </section>

      <ReportPanel s={s} />

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
        <Panel title="עקומת הון (לפי ביד — מה שאפשר לממש בפועל)" className="xl:col-span-2">
          <EquityChart s={s} />
        </Panel>
        <Panel title="מגבלות סיכון">
          <Row label="מקס׳ פרמיה לעסקה" value={fmtPct(s.risk.perTrade, 0)} />
          <Row label="מקס׳ פרמיה פתוחה" value={`${fmtPct(p.openPremiumPct, 1)} / ${fmtPct(s.risk.maxOpenPremium, 0)}`} tone={p.openPremiumPct > s.risk.maxOpenPremium * 0.9 ? 'text-warn' : 'text-text'} />
          <Row label="פוזיציות" value={`${s.positions.length} / ${s.risk.maxPositions}`} />
          <Row label="עצירה בהפסד יומי" value={fmtPct(s.risk.dailyLossLimit, 0)} />
          <Row label="עצירה בירידה מהשיא" value={`${fmtPct(p.drawdown, 1)} / ${fmtPct(s.risk.maxDrawdown, 0)}`} tone={p.drawdown > s.risk.maxDrawdown * 0.7 ? 'text-down' : 'text-text'} />
          <Row label="מרווח ביד/אסק מקסימלי" value={fmtPct(s.risk.maxSpreadPct, 0)} />
          <Row label="הגנת מחיר (IOC)" value={fmtPct(s.risk.maxSlippage, 1)} />
          <Row label="יציאה: יעד / סטופ" value={`+${fmtPct(s.exits.takeProfit, 0)} / −${fmtPct(s.exits.stopLoss, 0)}`} />
          <Row label="סגירה לפני פקיעה" value={`${s.exits.closeHoursBeforeExpiry} ש׳`} />
        </Panel>
      </div>

      <section className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {s.market.map((m) => {
          const ratio = m.atmIv > 0 ? m.rv16h / m.atmIv : 0;
          return (
            <Panel key={m.underlying} title={m.underlying} right={<span className={`num text-[11px] ${tone(m.dayChange)}`}>{fmtPct(m.dayChange, 2, true)}</span>}>
              <div className="num text-[18px] font-semibold text-white">{fmtNum(m.index, m.index > 1000 ? 1 : 3)}</div>
              <Spark v={m.spark} />
              <Row label="תנודתיות ממומשת 1ש׳ / 16ש׳" value={`${fmtPct(m.rv1h, 0)} / ${fmtPct(m.rv16h, 0)}`} />
              <Row label={`IV ATM (Binance, ${m.atmExpiry ? t(m.atmExpiry).slice(0, 5) : '—'})`} value={fmtPct(m.atmIv, 1)} />
              <Row label="RV / IV" value={ratio ? ratio.toFixed(2) : '—'} tone={ratio > 1.1 ? 'text-up' : 'text-dim'} />
              <Row label="מומנטום z 1ש׳ / 4ש׳" value={`${m.z1h.toFixed(1)} / ${m.z4h.toFixed(1)}`} tone={Math.abs(m.z1h) > 1.8 ? 'text-warn' : 'text-dim'} />
              <Row label="חיסולים 15ד׳ לונג / שורט" value={`${fmtCompactUsd(m.liq15mLong)} / ${fmtCompactUsd(m.liq15mShort)}`} />
              <Row label="חיסולים שעה" value={fmtCompactUsd(m.liq1h)} />
            </Panel>
          );
        })}
      </section>

      <Panel title={`פוזיציות פתוחות (${s.positions.length})`} bodyClass="p-0">
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[900px] text-[11px]">
            <thead className="bg-panel2 text-[10px] text-muted">
              <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-start [&>th]:font-semibold">
                <th>אסטרטגיה</th><th>חוזה</th><th>כמות</th><th>כניסה</th><th>ביד / אסק</th><th>מארק</th><th>IV</th><th>דלתא</th><th>תטא</th><th>עלות</th><th>שווי (ביד)</th><th>רו״ה</th><th>גיל</th>
              </tr>
            </thead>
            <tbody>
              {s.positions.flatMap((pos) =>
                pos.legs.map((l, i) => (
                  <tr key={pos.id + l.symbol} className={`border-t border-line/60 [&>td]:px-2 [&>td]:py-1 ${i ? '' : 'border-line2'}`}>
                    <td className="font-sans text-white">{i === 0 ? `${STRAT[pos.strategy]} · ${pos.underlying}` : ''}{i === 0 && pos.awaitingSettlement ? ' (ממתין לסילוק)' : ''}</td>
                    <td className="text-dim">{l.symbol}</td>
                    <td>{l.qty}</td>
                    <td>{fmtNum(l.entryPrice, 2)}</td>
                    <td><span className="text-up">{fmtNum(l.bid, 2)}</span> / <span className="text-down">{fmtNum(l.ask, 2)}</span></td>
                    <td>{fmtNum(l.mark, 2)}</td>
                    <td className="text-warn">{fmtPct(l.iv, 1)}</td>
                    <td>{l.delta.toFixed(2)}</td>
                    <td className="text-down">{l.theta.toFixed(2)}</td>
                    <td>{i === 0 ? fmtUsd(pos.cost, 2) : ''}</td>
                    <td>{i === 0 ? fmtUsd(pos.valueBid, 2) : ''}</td>
                    <td className={tone(pos.pnl)}>{i === 0 ? `${fmtSignedUsd(pos.pnl, 2)} (${fmtPct(pos.pnlPct, 0, true)})` : ''}</td>
                    <td className="text-dim">{i === 0 ? age(pos.openedAt) : ''}</td>
                  </tr>
                )),
              )}
              {!s.positions.length && <tr><td colSpan={13} className="py-5 text-center font-sans text-muted">אין פוזיציות פתוחות — הבוט ממתין לאות</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        <Panel title="אותות אחרונים" bodyClass="p-0">
          <div className="max-h-[260px] overflow-auto">
            {s.signals.map((g, i) => (
              <div key={i} className="border-b border-line/50 px-2.5 py-1.5 text-[11px]">
                <div className="flex justify-between gap-2">
                  <span className="text-white">{STRAT[g.strategy]} · {g.underlying} <span className="num text-dim">ציון {g.score.toFixed(2)}</span></span>
                  <span className={g.action === 'entered' ? 'text-up' : 'text-muted'}>{g.action === 'entered' ? 'נכנס' : `דולג: ${g.skipReason ?? ''}`}</span>
                </div>
                <div className="num text-[10px] text-dim">{t(g.time)} · {g.reason}</div>
              </div>
            ))}
            {!s.signals.length && <div className="p-4 text-center text-[11px] text-muted">עדיין אין אותות מעל הסף</div>}
          </div>
        </Panel>
        <Panel title="יומן ביצועים (מילויים)" bodyClass="p-0">
          <div className="max-h-[260px] overflow-auto">
            <table className="num w-full min-w-[640px] text-[10.5px]">
              <thead className="sticky top-0 bg-panel2 text-[10px] text-muted">
                <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-start [&>th]:font-semibold"><th>זמן</th><th>חוזה</th><th>צד</th><th>כמות</th><th>מחיר</th><th>ציטוט</th><th>החלקה</th><th>עמלה</th></tr>
              </thead>
              <tbody>
                {s.fills.map((f, i) => (
                  <tr key={i} className="border-t border-line/60 [&>td]:px-2 [&>td]:py-1" title={f.reason}>
                    <td className="text-dim">{t(f.time)}</td>
                    <td>{f.symbol}</td>
                    <td className={f.side === 'BUY' ? 'text-up' : f.side === 'SELL' ? 'text-down' : 'text-warn'}>{f.side === 'BUY' ? 'קנייה' : f.side === 'SELL' ? 'מכירה' : 'סילוק'}</td>
                    <td>{f.qty}</td>
                    <td className="text-white">{fmtNum(f.price, 2)}</td>
                    <td className="text-dim">{fmtNum(f.touch, 2)}</td>
                    <td className={f.slippageBp > 50 ? 'text-warn' : 'text-dim'}>{f.side === 'SETTLE' ? '' : `${f.slippageBp.toFixed(0)}bp`}</td>
                    <td className="text-warn">{f.fee.toFixed(3)}</td>
                  </tr>
                ))}
                {!s.fills.length && <tr><td colSpan={8} className="py-5 text-center font-sans text-muted">אין מילויים עדיין</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        <Panel title={`עסקאות סגורות (${p.trades})`} bodyClass="p-0">
          <div className="max-h-[260px] overflow-auto">
            <table className="num w-full min-w-[560px] text-[10.5px]">
              <thead className="sticky top-0 bg-panel2 text-[10px] text-muted">
                <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:text-start [&>th]:font-semibold"><th>נסגר</th><th>אסטרטגיה</th><th>עלות</th><th>תמורה</th><th>רו״ה</th><th>סיבה</th></tr>
              </thead>
              <tbody>
                {s.closed.map((c) => (
                  <tr key={c.id} className="border-t border-line/60 [&>td]:px-2 [&>td]:py-1">
                    <td className="text-dim">{t(c.closedAt)}</td>
                    <td className="font-sans">{STRAT[c.strategy]} · {c.underlying}</td>
                    <td>{fmtUsd(c.cost, 2)}</td>
                    <td>{fmtUsd(c.proceeds, 2)}</td>
                    <td className={tone(c.pnl)}>{fmtSignedUsd(c.pnl, 2)} ({fmtPct(c.pnlPct, 0, true)})</td>
                    <td className="font-sans text-dim">{c.exitReason}</td>
                  </tr>
                ))}
                {!s.closed.length && <tr><td colSpan={6} className="py-5 text-center font-sans text-muted">אין עסקאות סגורות עדיין</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="יומן אירועים" bodyClass="p-0">
          <div className="max-h-[260px] overflow-auto">
            {[...s.status.errors.map((e) => ({ time: e.time, level: 'error' as const, text: `שגיאת API: ${e.msg}` })), ...s.events].sort((a, b) => b.time - a.time).slice(0, 60).map((e, i) => (
              <div key={i} className="flex gap-2 border-b border-line/50 px-2.5 py-1 text-[11px]">
                <span className="num shrink-0 text-muted">{t(e.time)}</span>
                <span className={e.level === 'error' ? 'text-down' : e.level === 'warn' ? 'text-warn' : 'text-text'}>{e.text}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <footer className="pb-1 text-center text-[10px] text-muted">
        נתוני אמת מ-Binance European Options: ציטוטים, מארק ויווניות של הבורסה, ספרי פקודות לכל ביצוע, מחירי סילוק רשמיים ועמלות לפי נוסחת Binance. קנייה בלבד, כמו בחשבון Binance רגיל. אין לראות בכך ייעוץ השקעות.
      </footer>
    </div>
  );
}
