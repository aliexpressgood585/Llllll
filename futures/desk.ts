/**
 * The trading desk: six agents, each with one real job. An agent is "working" only while it actually performs
 * an action, and every action is recorded as an event with the numbers behind it. When there is nothing to do,
 * the agent says what it is waiting for.
 *
 *   סורק שוק        pulls marks, funding, order books and candles from Binance
 *   אנליסטית        reads closed candles and emits a trade signal (trend + breakout + ATR stop)
 *   מנהל סיכונים    sizes the trade from the stop, picks leverage, checks limits — approves or rejects
 *   סוחר ביצוע      executes approved orders through the real order book, manages stops / targets / trailing
 *   גזברית          marks the book to market, settles funding, watches drawdown and liquidation distance
 *   כתב             writes the hourly summary, the daily log and the weekly report
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Account, liqPrice, sign, walk, type AccountState, type Position, type Side, type Trade } from './account';
import type { FConfig } from './config';
import type { Candle, Feed, Quote, SymbolInfo } from './feed';
import { atr, ema, floorStep, rsi } from './indicators';
import { weeklyReport } from './report';

export type AgentId = 'scout' | 'analyst' | 'risk' | 'trader' | 'treasurer' | 'reporter';
export interface AgentState {
  id: AgentId; name: string; title: string; job: string;
  status: 'working' | 'idle' | 'error' | 'paused';
  action: string; actionAt: number; waiting: string; done: number; errors: number;
  history: { t: number; text: string }[];
}
export type EventType = 'scan' | 'candles' | 'signal' | 'no-signal' | 'approve' | 'reject' | 'fill' | 'close' | 'stop-moved' | 'funding' | 'mark' | 'halt' | 'report' | 'error' | 'control';
export interface DeskEvent { seq: number; t: number; agent: AgentId; type: EventType; text: string; symbol?: string; to?: AgentId }
export interface Signal { symbol: string; side: Side; entry: number; stop: number; target: number; atr: number; reason: string; candleT: number }

const ROSTER: Record<AgentId, { name: string; title: string; job: string }> = {
  scout: { name: 'איתן', title: 'סורק שוק', job: 'מושך מחירי mark, מימון, ספר פקודות ונרות מ-Binance' },
  analyst: { name: 'מאיה', title: 'אנליסטית', job: 'בודקת כל נר סגור: מגמה, פריצה ותנודתיות — ומוציאה סיגנל' },
  risk: { name: 'דוד', title: 'מנהל סיכונים', job: 'מחשב גודל ומינוף מהסטופ, בודק מגבלות — מאשר או דוחה' },
  trader: { name: 'רוני', title: 'סוחר ביצוע', job: 'מבצע דרך ספר הפקודות האמיתי ומנהל סטופ, יעד וסטופ נגרר' },
  treasurer: { name: 'שירה', title: 'גזברית', job: 'שווי תיק בזמן אמת, תשלומי מימון, ירידה מהשיא ומרחק מחיסול' },
  reporter: { name: 'יונתן', title: 'כתב', job: 'סיכום שעתי, יומן יומי ודוח שבועי' },
};

const px = (v: number) => (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v >= 1 ? v.toFixed(3) : v.toPrecision(4));
const usd = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
const coin = (s: string) => s.replace(/USDT$/, '');
const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

interface Saved { account: AccountState; agents: Pick<AgentState, 'id' | 'done' | 'errors' | 'history'>[]; events: DeskEvent[]; seq: number; lastCandle: Record<string, number>; lastHour: number; lastWeek: string; fundingSettled: Record<string, number>; startedAt: number; counts?: Partial<Record<EventType, number>> }

export class Desk {
  acct: Account;
  agents = {} as Record<AgentId, AgentState>;
  events: DeskEvent[] = [];
  quotes = new Map<string, Quote>();
  info = new Map<string, SymbolInfo>();
  c15 = new Map<string, Candle[]>();
  c1h = new Map<string, Candle[]>();
  private seq = 0;
  private lastCandle: Record<string, number> = {};
  private pendingFunding = new Map<string, { rate: number; at: number }>();
  private fundingSettled: Record<string, number> = {};
  private lastHour = 0;
  private lastWeek = '';
  private hourCounts: Partial<Record<EventType, number>> = {};
  startedAt: number;
  lastScanOk = 0;
  /** lifetime count of actions by type */
  counts: Partial<Record<EventType, number>> = {};

  constructor(public feed: Feed, public cfg: FConfig, private persist = true) {
    const saved = persist && existsSync(cfg.stateFile) ? (JSON.parse(readFileSync(cfg.stateFile, 'utf8')) as Saved) : null;
    this.acct = new Account(cfg.capital, saved?.account);
    for (const id of Object.keys(ROSTER) as AgentId[]) {
      const s = saved?.agents.find((a) => a.id === id);
      this.agents[id] = { id, ...ROSTER[id], status: 'idle', action: '', actionAt: 0, waiting: 'מתחיל…', done: s?.done ?? 0, errors: s?.errors ?? 0, history: s?.history ?? [] };
    }
    this.events = saved?.events ?? [];
    this.seq = saved?.seq ?? 0;
    this.lastCandle = saved?.lastCandle ?? {};
    this.lastHour = saved?.lastHour ?? 0;
    this.lastWeek = saved?.lastWeek ?? '';
    this.fundingSettled = saved?.fundingSettled ?? {};
    this.startedAt = saved?.startedAt ?? feed.now();
    this.counts = saved?.counts ?? {};
  }

  /* ------------------------------------------------------------ bookkeeping */
  /** Record a real action. Routine actions (quiet) update the agent but stay out of the shared event log. */
  private emit(agent: AgentId, type: EventType, text: string, extra: Partial<DeskEvent> & { quiet?: boolean } = {}) {
    const t = this.feed.now();
    const a = this.agents[agent];
    a.status = 'working'; a.action = text; a.actionAt = t; a.done++;
    a.history.unshift({ t, text }); if (a.history.length > 15) a.history.length = 15;
    const { quiet, ...rest } = extra;
    const e: DeskEvent = { seq: ++this.seq, t, agent, type, text, ...rest };
    this.counts[type] = (this.counts[type] ?? 0) + 1;
    if (quiet) return e;
    this.events.push(e); if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
    return e;
  }
  private wait(agent: AgentId, text: string) { const a = this.agents[agent]; a.waiting = text; if (a.status !== 'paused') a.status = 'idle'; }
  private fail(agent: AgentId, err: unknown) {
    const a = this.agents[agent]; a.errors++; a.status = 'error';
    const msg = err instanceof Error ? err.message : String(err);
    a.waiting = `שגיאה: ${msg.slice(0, 120)}`;
    this.events.push({ seq: ++this.seq, t: this.feed.now(), agent, type: 'error', text: msg.slice(0, 200) });
  }
  marks() { return new Map([...this.quotes].map(([k, q]) => [k, q.mark])); }
  equity() { return this.acct.equity(this.marks()); }
  mmrOf(symbol: string) { return symbol === 'BTCUSDT' ? this.cfg.risk.mmrBtc : this.cfg.risk.mmr; }

  save() {
    if (!this.persist) return;
    const s: Saved = { account: this.acct.s, agents: Object.values(this.agents).map(({ id, done, errors, history }) => ({ id, done, errors, history })), events: this.events.slice(-200), seq: this.seq, lastCandle: this.lastCandle, lastHour: this.lastHour, lastWeek: this.lastWeek, fundingSettled: this.fundingSettled, startedAt: this.startedAt, counts: this.counts };
    writeFileSync(`${this.cfg.stateFile}.tmp`, JSON.stringify(s));
    renameSync(`${this.cfg.stateFile}.tmp`, this.cfg.stateFile);
  }
  private journal(t: Trade) {
    if (!this.persist) return;
    const f = this.cfg.journalFile;
    if (!existsSync(f)) writeFileSync(f, 'closedAt,symbol,side,qty,entry,exit,leverage,gross,fees,funding,net,r,reason\n');
    appendFileSync(f, [new Date(t.closedAt).toISOString(), t.symbol, t.side, t.qty, t.entry, t.exit, t.lev, t.gross.toFixed(4), t.fees.toFixed(4), t.funding.toFixed(4), t.net.toFixed(4), t.r.toFixed(3), `"${t.reason}"`].join(',') + '\n');
  }

  /* ------------------------------------------------------------ סורק שוק */
  async loadSymbols() {
    try {
      const list = await this.feed.symbols(this.cfg.symbols);
      for (const s of list) this.info.set(s.symbol, s);
      const missing = this.cfg.symbols.filter((s) => !this.info.has(s));
      this.emit('scout', 'scan', `טען כללי מסחר ל-${list.length} חוזים (גודל צעד, טיק, מינימום)${missing.length ? ` · לא נסחרים: ${missing.join(', ')}` : ''}`);
    } catch (e) { this.fail('scout', e); throw e; }
  }

  async scan() {
    try {
      const qs = await this.feed.quotes([...this.info.keys()]);
      const now = this.feed.now();
      for (const q of qs) {
        // remember the rate that will be charged at the next settlement
        const prev = this.quotes.get(q.symbol);
        if (prev && prev.nextFunding <= now && q.nextFunding > prev.nextFunding) this.pendingFunding.set(q.symbol, { rate: prev.funding, at: prev.nextFunding });
        this.quotes.set(q.symbol, q);
      }
      this.lastScanOk = now;
      const btc = this.quotes.get('BTCUSDT');
      this.emit('scout', 'scan', `משך מחירים ומימון ל-${qs.length} חוזים${btc ? ` · BTC ${px(btc.mark)}` : ''}`, { quiet: true });
      this.wait('scout', `סריקה הבאה בעוד ${Math.round(this.cfg.fastMs / 1000)} שנ׳`);
    } catch (e) { this.fail('scout', e); }
  }

  /** Refresh candles; returns the symbols that have a newly closed entry candle. */
  async refreshCandles(): Promise<string[]> {
    const fresh: string[] = [];
    try {
      for (const s of this.info.keys()) {
        const [a, b] = await Promise.all([this.feed.candles(s, this.cfg.strategy.tf, 250), this.feed.candles(s, this.cfg.strategy.trendTf, 120)]);
        const now = this.feed.now();
        const closedA = a.filter((c) => c.closeT < now), closedB = b.filter((c) => c.closeT < now);
        this.c15.set(s, closedA); this.c1h.set(s, closedB);
        const last = closedA.at(-1)?.t ?? 0;
        if (last && last !== this.lastCandle[s]) { this.lastCandle[s] = last; fresh.push(s); }
      }
      if (fresh.length) this.emit('scout', 'candles', `נר ${this.cfg.strategy.tf} נסגר ב-${fresh.map(coin).join(', ')} — העביר לאנליסטית`, { to: 'analyst' });
    } catch (e) { this.fail('scout', e); }
    return fresh;
  }

  /* ------------------------------------------------------------ אנליסטית */
  analyze(symbol: string): Signal | null {
    const st = this.cfg.strategy;
    const a = this.c15.get(symbol) ?? [], b = this.c1h.get(symbol) ?? [];
    const q = this.quotes.get(symbol);
    if (a.length < Math.max(60, st.breakoutLookback + 20) || b.length < 60 || !q) {
      this.emit('analyst', 'no-signal', `${coin(symbol)}: אין מספיק היסטוריה עדיין (${a.length} נרות)`, { symbol, quiet: true });
      return null;
    }
    const closes1h = b.map((c) => c.c);
    const e20 = ema(closes1h, 20).at(-1)!, e50 = ema(closes1h, 50).at(-1)!, last1h = closes1h.at(-1)!;
    const trend: Side | null = e20 > e50 && last1h > e50 ? 'LONG' : e20 < e50 && last1h < e50 ? 'SHORT' : null;
    const last = a.at(-1)!;
    const window = a.slice(-(st.breakoutLookback + 1), -1);
    const hi = Math.max(...window.map((c) => c.h)), lo = Math.min(...window.map((c) => c.l));
    const vol = atr(a.slice(-100), 14), volPct = vol / last.c;
    const r = rsi(a.slice(-100).map((c) => c.c), 14);
    const trendHe = trend === 'LONG' ? 'מגמה עולה' : trend === 'SHORT' ? 'מגמה יורדת' : 'אין מגמה';
    const base = `${coin(symbol)}: ${trendHe} (EMA20 ${px(e20)} / EMA50 ${px(e50)}), ATR ${(volPct * 100).toFixed(2)}%, RSI ${r.toFixed(0)}`;

    let side: Side | null = null;
    let why = '';
    if (!trend) why = 'אין מגמה ברורה';
    else if (volPct < st.minAtrPct || volPct > st.maxAtrPct) why = 'תנודתיות מחוץ לטווח';
    else if (trend === 'LONG' && last.c > hi) side = r < 78 ? 'LONG' : null, why = side ? '' : 'RSI גבוה מדי — לא רודפים';
    else if (trend === 'SHORT' && last.c < lo) side = r > 22 ? 'SHORT' : null, why = side ? '' : 'RSI נמוך מדי — לא רודפים';
    else why = `אין פריצה (טווח ${px(lo)}–${px(hi)})`;
    if (side === 'LONG' && q.funding > st.maxFunding) { side = null; why = `מימון גבוה ${(q.funding * 100).toFixed(3)}% — לונג יקר`; }
    if (side === 'SHORT' && q.funding < -st.maxFunding) { side = null; why = `מימון שלילי ${(q.funding * 100).toFixed(3)}% — שורט יקר`; }
    if (!side) { this.emit('analyst', 'no-signal', `${base} · ${why}`, { symbol, quiet: true }); return null; }

    const entry = side === 'LONG' ? q.ask : q.bid;
    const stop = entry - sign(side) * st.atrStop * vol;
    const target = entry + sign(side) * st.targetR * Math.abs(entry - stop);
    const sig: Signal = { symbol, side, entry, stop, target, atr: vol, candleT: last.t, reason: `פריצת ${st.breakoutLookback} נרות ${side === 'LONG' ? 'למעלה' : 'למטה'} ב${trendHe}` };
    this.emit('analyst', 'signal', `סיגנל ${side === 'LONG' ? 'לונג' : 'שורט'} ${coin(symbol)} @${px(entry)} · סטופ ${px(stop)} · יעד ${px(target)} — ${sig.reason}`, { symbol, to: 'risk' });
    return sig;
  }

  /* ------------------------------------------------------------ מנהל סיכונים */
  review(sig: Signal): (Signal & { qty: number; lev: number; margin: number; liq: number; riskUsd: number }) | null {
    const R = this.cfg.risk, s = this.acct.s, marks = this.marks();
    const eq = this.acct.equity(marks);
    const reject = (why: string) => { this.emit('risk', 'reject', `דחה ${coin(sig.symbol)} ${sig.side === 'LONG' ? 'לונג' : 'שורט'}: ${why}`, { symbol: sig.symbol }); return null; };
    if (s.paused) return reject('המסחר מושהה ידנית');
    if (s.halted) return reject(`עצירת חירום: ${s.halted}`);
    if (eq <= s.dayStart * (1 - R.dailyLoss)) return reject(`הגענו למגבלת ההפסד היומית (${(R.dailyLoss * 100).toFixed(0)}%)`);
    if (s.positions.length >= R.maxPositions) return reject(`כבר ${s.positions.length} פוזיציות פתוחות (מקסימום ${R.maxPositions})`);
    if (s.positions.some((p) => p.symbol === sig.symbol)) return reject('כבר יש פוזיציה פתוחה בחוזה הזה');
    const info = this.info.get(sig.symbol);
    if (!info) return reject('אין כללי מסחר לחוזה');
    const dist = Math.abs(sig.entry - sig.stop);
    const riskUsd = eq * R.perTrade;
    let qty = floorStep(riskUsd / dist, info.step);
    const marginCap = eq * R.maxMarginPerPos;
    let lev = Math.max(1, Math.ceil((qty * sig.entry) / marginCap));
    if (lev > R.maxLeverage) { lev = R.maxLeverage; qty = floorStep((marginCap * lev) / sig.entry, info.step); }
    if (qty < info.minQty || qty * sig.entry < info.minNotional) return reject(`הגודל (${qty} ${coin(sig.symbol)}) קטן מהמינימום של Binance`);
    // the stop must be hit well before liquidation; lower the leverage until it is
    const mmr = this.mmrOf(sig.symbol);
    let margin = (qty * sig.entry) / lev, liq = liqPrice(sig.side, qty, sig.entry, margin, mmr);
    while (lev > 1 && Math.abs(sig.entry - liq) < dist * 2) { lev--; margin = (qty * sig.entry) / lev; liq = liqPrice(sig.side, qty, sig.entry, margin, mmr); }
    if (Math.abs(sig.entry - liq) < dist * 1.5) return reject('מחיר החיסול קרוב מדי לסטופ גם במינוף 1');
    if (margin > this.acct.available(marks)) return reject(`אין מספיק מרג׳ין פנוי (${usd(this.acct.available(marks))})`);
    const realRisk = qty * dist;
    this.emit('risk', 'approve', `אישר ${coin(sig.symbol)} ${sig.side === 'LONG' ? 'לונג' : 'שורט'}: ${qty} יח׳ ≈ ${usd(qty * sig.entry)}, מינוף ${lev}x, מרג׳ין ${usd(margin)}, סיכון ${usd(realRisk)} (${((realRisk / eq) * 100).toFixed(2)}%), חיסול ${px(liq)}`, { symbol: sig.symbol, to: 'trader' });
    return { ...sig, qty, lev, margin, liq, riskUsd: realRisk };
  }

  /* ------------------------------------------------------------ סוחר ביצוע */
  async execute(o: Signal & { qty: number; lev: number; margin: number; liq: number; riskUsd: number }) {
    try {
      const book = await this.feed.book(o.symbol);
      const f = walk(book, o.side === 'LONG' ? 'BUY' : 'SELL', o.qty, this.cfg.risk.maxSlippage);
      const info = this.info.get(o.symbol)!;
      const qty = floorStep(f.filled, info.step);
      if (qty < info.minQty || qty * f.avg < info.minNotional) { this.emit('trader', 'reject', `ביטל ${coin(o.symbol)}: אין מספיק נזילות בטווח ההחלקה (${(this.cfg.risk.maxSlippage * 100).toFixed(1)}%)`, { symbol: o.symbol }); return; }
      // keep the planned risk distance from the real fill
      const dist = Math.abs(o.entry - o.stop);
      const stop = f.avg - sign(o.side) * dist, target = f.avg + sign(o.side) * this.cfg.strategy.targetR * dist;
      const margin = (qty * f.avg) / o.lev, mmr = this.mmrOf(o.symbol);
      const fee = qty * f.avg * this.cfg.fees.taker;
      const now = this.feed.now();
      this.acct.open({ id: `${o.symbol}-${now}`, symbol: o.symbol, side: o.side, qty, entry: f.avg, lev: o.lev, margin, stop, target, liq: liqPrice(o.side, qty, f.avg, margin, mmr), riskUsd: qty * dist, rDist: dist, openedAt: now, reason: o.reason, mmr }, fee);
      this.emit('trader', 'fill', `${o.side === 'LONG' ? 'קנה' : 'מכר בשורט'} ${qty} ${coin(o.symbol)} @${px(f.avg)} (החלקה ${(((f.avg - f.best) / f.best) * 100 * sign(o.side)).toFixed(3)}%, עמלה ${usd(fee)}) · סטופ ${px(stop)} · יעד ${px(target)}`, { symbol: o.symbol });
      this.save();
    } catch (e) { this.fail('trader', e); }
  }

  /** Stops, targets, breakeven/trailing, time stop and liquidation — checked on every mark update. */
  async manage() {
    const now = this.feed.now();
    const s = this.acct.s;
    if (!s.positions.length) { this.wait('trader', s.paused ? 'המסחר מושהה' : 'אין פוזיציות פתוחות — ממתין לאישור ממנהל הסיכונים'); return; }
    let acted = false;
    for (const p of [...s.positions]) {
      const q = this.quotes.get(p.symbol); if (!q) continue;
      const m = q.mark, dir = sign(p.side);
      let reason = '';
      if (dir * (m - p.liq) <= 0) { await this.closePos(p, p.liq, 'חוסל (מחיר החיסול)', true); acted = true; continue; }
      if (dir * (m - p.stop) <= 0) reason = p.beMoved ? 'סטופ נגרר' : 'סטופ';
      else if (dir * (m - p.target) >= 0) reason = 'יעד';
      else if (now - p.openedAt > this.cfg.exits.maxHoldHours * 3600e3) reason = `זמן מקסימלי (${this.cfg.exits.maxHoldHours} ש׳)`;
      if (reason) { await this.closePos(p, null, reason); acted = true; continue; }
      const profitR = (dir * (m - p.entry)) / p.rDist;
      if (!p.beMoved && profitR >= this.cfg.exits.breakevenR) {
        p.beMoved = true;
        p.stop = p.entry + dir * p.entry * this.cfg.fees.taker * 2; // cover both fees
        this.emit('trader', 'stop-moved', `${coin(p.symbol)} ברווח ${profitR.toFixed(1)}R — הזיז סטופ לנקודת איזון ${px(p.stop)}`, { symbol: p.symbol });
        acted = true;
      } else if (p.beMoved) {
        const trail = m - dir * p.rDist;
        if (dir * (trail - p.stop) > p.rDist * 0.25) { p.stop = trail; this.emit('trader', 'stop-moved', `${coin(p.symbol)} — גרר סטופ ל-${px(trail)} (${profitR.toFixed(1)}R)`, { symbol: p.symbol }); acted = true; }
      }
    }
    if (!acted) this.wait('trader', `שומר על ${s.positions.length} פוזיציות — בודק סטופ/יעד כל ${Math.round(this.cfg.fastMs / 1000)} שנ׳`);
  }

  private async closePos(p: Position, forced: number | null, reason: string, liquidation = false) {
    let exit = forced ?? 0, fee = 0;
    if (!liquidation) {
      try {
        const book = await this.feed.book(p.symbol);
        const f = walk(book, p.side === 'LONG' ? 'SELL' : 'BUY', p.qty, 0.05);
        exit = f.filled >= p.qty * 0.999 ? f.avg : this.quotes.get(p.symbol)!.mark;
      } catch { exit = this.quotes.get(p.symbol)!.mark; }
      fee = p.qty * exit * this.cfg.fees.taker;
    } else fee = p.qty * exit * 0.005; // Binance liquidation clearance fee (approximation)
    const t = this.acct.close(p, exit, fee, this.feed.now(), reason, liquidation);
    this.journal(t);
    this.emit('trader', 'close', `סגר ${coin(p.symbol)} ${p.side === 'LONG' ? 'לונג' : 'שורט'} @${px(exit)} — ${reason} · נטו ${usd(t.net)} (${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R)`, { symbol: p.symbol, to: 'treasurer' });
    this.save();
  }

  async closeAll(why: string) { for (const p of [...this.acct.s.positions]) await this.closePos(p, null, why); }

  /* ------------------------------------------------------------ גזברית */
  treasury() {
    const s = this.acct.s, now = this.feed.now(), marks = this.marks();
    // funding settlements
    for (const p of s.positions) {
      const pend = this.pendingFunding.get(p.symbol);
      if (pend && this.fundingSettled[p.symbol] !== pend.at && p.openedAt < pend.at) {
        const amt = this.acct.fund(p, marks.get(p.symbol) ?? p.entry, pend.rate);
        this.fundingSettled[p.symbol] = pend.at;
        this.emit('treasurer', 'funding', `${amt >= 0 ? 'קיבלה' : 'שילמה'} מימון ${usd(Math.abs(amt))} על ${coin(p.symbol)} ${p.side === 'LONG' ? 'לונג' : 'שורט'} (שיעור ${(pend.rate * 100).toFixed(4)}%)`, { symbol: p.symbol });
      }
    }
    for (const sym of [...this.pendingFunding.keys()]) if (!s.positions.some((p) => p.symbol === sym)) this.pendingFunding.delete(sym);
    const eq = this.acct.equity(marks);
    const day = utcDay(now);
    if (s.day !== day) {
      if (s.day) this.emit('treasurer', 'mark', `יום חדש (UTC): הון פתיחה ${usd(eq)} · אתמול ${usd(eq - s.dayStart)}`);
      s.day = day; s.dayStart = eq;
    }
    s.peak = Math.max(s.peak, eq);
    const dd = (s.peak - eq) / s.peak;
    if (!s.halted && dd >= this.cfg.risk.maxDrawdown) {
      s.halted = `ירידה של ${(dd * 100).toFixed(1)}% מהשיא`;
      this.emit('treasurer', 'halt', `עצירת חירום: ירידה של ${(dd * 100).toFixed(1)}% מהשיא — אין כניסות חדשות עד חידוש ידני`);
    }
    const last = s.curve.at(-1);
    if (!last || now - last.t >= 15 * 60e3) {
      s.curve.push({ t: now, e: Number(eq.toFixed(2)) });
      if (s.curve.length > 3000) s.curve.splice(0, s.curve.length - 3000);
      const open = this.acct.unrealized(marks);
      this.emit('treasurer', 'mark', `שווי תיק ${usd(eq)} (${(((eq - s.capital) / s.capital) * 100).toFixed(2)}%) · פתוח ${usd(open)} · מרג׳ין בשימוש ${usd(this.acct.marginUsed())} · ירידה מהשיא ${(dd * 100).toFixed(1)}%`);
    }
    const near = s.positions.map((p) => ({ p, d: Math.abs((marks.get(p.symbol) ?? p.entry) - p.liq) / (marks.get(p.symbol) ?? p.entry) })).sort((a, b) => a.d - b.d)[0];
    this.wait('treasurer', near ? `עוקבת: ${coin(near.p.symbol)} במרחק ${(near.d * 100).toFixed(1)}% מחיסול · הון ${usd(eq)}` : `הון ${usd(eq)} · אין חשיפה פתוחה`);
  }

  /* ------------------------------------------------------------ כתב */
  report() {
    const now = this.feed.now();
    const hour = Math.floor(now / 3600e3);
    if (hour !== this.lastHour) {
      const first = this.lastHour === 0;
      this.lastHour = hour;
      const prevCounts = this.hourCounts;
      this.hourCounts = { ...this.counts };
      if (!first) {
        const s = this.acct.s, eq = this.equity();
        const hourTrades = s.trades.filter((t) => t.closedAt > now - 3600e3);
        const count = (type: EventType) => (this.counts[type] ?? 0) - (prevCounts[type] ?? 0);
        this.emit('reporter', 'report', `סיכום שעה: הון ${usd(eq)} (${(((eq - s.capital) / s.capital) * 100).toFixed(2)}%) · ${count('no-signal') + count('signal')} בדיקות נרות, ${count('signal')} סיגנלים, ${count('approve')} אושרו, ${count('reject')} נדחו · ${hourTrades.length} עסקאות נסגרו (${usd(hourTrades.reduce((a, t) => a + t.net, 0))}) · ${s.positions.length} פתוחות`);
      }
    }
    // weekly report every Monday 00:00 UTC (and on demand via the API)
    const d = new Date(now);
    const weekKey = d.getUTCDay() === 1 ? utcDay(now) : this.lastWeek;
    if (weekKey !== this.lastWeek) { this.lastWeek = weekKey; this.writeWeekly(); }
    const mins = 60 - new Date(now).getUTCMinutes();
    this.wait('reporter', `הסיכום הבא בעוד ${mins} דק׳`);
  }

  writeWeekly() {
    const md = weeklyReport(this);
    if (this.persist) {
      mkdirSync(this.cfg.reportDir, { recursive: true });
      const f = join(this.cfg.reportDir, `week-${utcDay(this.feed.now())}.md`);
      writeFileSync(f, md);
      this.emit('reporter', 'report', `כתב דוח שבועי: ${f}`);
    }
    return md;
  }

  /* ------------------------------------------------------------ the loop */
  async fastTick() {
    await this.scan();
    if (this.quotes.size) { await this.manage(); this.treasury(); }
    this.report();
    this.decay();
  }

  async candleTick() {
    const fresh = await this.refreshCandles();
    const nextClose = Math.min(...[...this.c15.values()].map((c) => (c.at(-1)?.closeT ?? 0) + 15 * 60e3 + 1));
    for (const sym of fresh) {
      const sig = this.analyze(sym);
      if (!sig) continue;
      const ok = this.review(sig);
      if (ok) await this.execute(ok);
    }
    const mins = Number.isFinite(nextClose) ? Math.max(0, Math.round((nextClose - this.feed.now()) / 60e3)) : 0;
    this.wait('analyst', `ממתינה לנר ${this.cfg.strategy.tf} הבא (עוד ${mins} דק׳) ב-${this.info.size} חוזים`);
    this.wait('risk', this.acct.s.halted ? `עצירת חירום: ${this.acct.s.halted}` : 'ממתין לסיגנל מהאנליסטית');
    this.save();
  }

  /** An agent shows as working for a few seconds after a real action, then goes back to waiting. */
  private decay() {
    const now = this.feed.now();
    for (const a of Object.values(this.agents)) {
      if (this.acct.s.paused && a.id !== 'scout' && a.id !== 'treasurer' && a.id !== 'reporter') a.status = 'paused';
      else if (a.status === 'working' && now - a.actionAt > 6000) a.status = 'idle';
      else if (a.status === 'paused') a.status = 'idle';
    }
  }

  async control(action: string) {
    const s = this.acct.s;
    if (action === 'pause') { s.paused = true; this.events.push({ seq: ++this.seq, t: this.feed.now(), agent: 'risk', type: 'control', text: 'המסחר הושהה ידנית — אין כניסות חדשות; פוזיציות פתוחות ממשיכות להיות מנוהלות' }); }
    else if (action === 'resume') { s.paused = false; s.halted = null; s.peak = this.equity(); this.events.push({ seq: ++this.seq, t: this.feed.now(), agent: 'risk', type: 'control', text: 'המסחר חודש ידנית (השיא אופס להון הנוכחי)' }); }
    else if (action === 'close-all') await this.closeAll('סגירה ידנית');
    else if (action === 'report') this.writeWeekly();
    else return 'unknown action';
    this.save();
    return 'ok';
  }

  snapshot() {
    const marks = this.marks(), s = this.acct.s, eq = this.acct.equity(marks);
    const closed = s.trades;
    const wins = closed.filter((t) => t.net > 0);
    return {
      mode: this.cfg.mode, startedAt: this.startedAt, now: this.feed.now(), lastScanOk: this.lastScanOk,
      config: { capital: s.capital, symbols: this.cfg.symbols, tf: this.cfg.strategy.tf, trendTf: this.cfg.strategy.trendTf, riskPerTrade: this.cfg.risk.perTrade, maxLeverage: this.cfg.risk.maxLeverage, maxPositions: this.cfg.risk.maxPositions, dailyLoss: this.cfg.risk.dailyLoss, maxDrawdown: this.cfg.risk.maxDrawdown, fees: this.cfg.fees },
      account: { equity: eq, wallet: s.wallet, unrealized: this.acct.unrealized(marks), marginUsed: this.acct.marginUsed(), available: this.acct.available(marks), peak: s.peak, drawdown: s.peak ? (s.peak - eq) / s.peak : 0, dayPnl: eq - s.dayStart, feesPaid: s.feesPaid, fundingNet: s.fundingNet, halted: s.halted, paused: s.paused, returnPct: (eq - s.capital) / s.capital },
      stats: { trades: closed.length, winRate: closed.length ? wins.length / closed.length : 0, avgR: closed.length ? closed.reduce((a, t) => a + t.r, 0) / closed.length : 0, net: closed.reduce((a, t) => a + t.net, 0) },
      positions: s.positions.map((p) => { const m = marks.get(p.symbol) ?? p.entry; const u = sign(p.side) * (m - p.entry) * p.qty; return { ...p, mark: m, upnl: u, upnlR: u / p.riskUsd, liqDist: Math.abs(m - p.liq) / m }; }),
      trades: closed.slice(-60).reverse(),
      quotes: [...this.quotes.values()],
      agents: Object.values(this.agents),
      counts: this.counts,
      events: this.events.slice(-150),
      curve: s.curve.slice(-700),
      sparks: Object.fromEntries([...this.c15].map(([k, c]) => [k, c.slice(-48).map((x) => x.c)])),
    };
  }
}
