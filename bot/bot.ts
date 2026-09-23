import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Broker, Execution } from './broker';
import { CONFIG } from './config';
import { exerciseFee, intrinsic, tradeFee } from './fees';
import { floorTo, type Contract, type OptionsMarket } from './market';
import { candidates, type Plan } from './strategy';
import type { BotState, ClosedTrade, FillRecord, Position, Signal } from './types';

const DAY = 86400e3;
const HE: Record<string, string> = { LONG_STRADDLE: 'לונג סטראדל', LONG_CALL: 'לונג קול', LONG_PUT: 'לונג פוט' };
const today = () => Math.floor(Date.now() / DAY);

export class TradingBot {
  state: BotState;
  private busy = false;
  private lastDecision = 0;
  private lastSettlementPoll = 0;

  constructor(private market: OptionsMarket, private broker: Broker) {
    this.state = this.load() ?? {
      v: 1,
      startedAt: Date.now(),
      capital: CONFIG.capital,
      cash: CONFIG.capital,
      positions: [],
      closed: [],
      fills: [],
      equity: [{ t: Date.now(), equity: CONFIG.capital }],
      peakEquity: CONFIG.capital,
      dayStart: { day: today(), equity: CONFIG.capital },
      feesPaid: 0,
      halted: false,
      haltReason: '',
      entriesPausedUntil: 0,
      signals: [],
      events: [],
    };
    if (!existsSync(CONFIG.journalFile)) appendFileSync(CONFIG.journalFile, 'time,mode,position,strategy,symbol,side,qty,price,fee,touch,slippage_bp,reason,order_id\n');
    this.event('info', `הבוט הופעל · מצב ${this.broker.kind === 'live' ? 'מסחר אמיתי' : 'מסחר על נייר'} · תיק קבוע ${this.state.capital} USDT · מזומן ${this.state.cash.toFixed(2)}`);
  }

  // ------------------------------------------------------------ persistence
  private load(): BotState | null {
    try {
      if (!existsSync(CONFIG.stateFile)) return null;
      const s = JSON.parse(readFileSync(CONFIG.stateFile, 'utf8')) as BotState;
      return s.v === 1 ? s : null;
    } catch {
      return null;
    }
  }

  save(): void {
    const tmp = `${CONFIG.stateFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state));
    renameSync(tmp, CONFIG.stateFile); // atomic replace: a crash never leaves a half-written state
  }

  event(level: 'info' | 'warn' | 'error', text: string) {
    this.state.events.unshift({ time: Date.now(), level, text });
    if (this.state.events.length > 200) this.state.events.length = 200;
    console.log(`${new Date().toISOString()} [${level}] ${text}`);
  }

  private journal(f: FillRecord) {
    this.state.fills.unshift(f);
    if (this.state.fills.length > 500) this.state.fills.length = 500;
    const row = [new Date(f.time).toISOString(), f.mode, f.positionId, f.strategy, f.symbol, f.side, f.qty, f.price, f.fee.toFixed(6), f.touch, f.slippageBp.toFixed(2), `"${f.reason.replace(/"/g, "'")}"`, f.orderId ?? ''];
    appendFileSync(CONFIG.journalFile, row.join(',') + '\n');
  }

  // ------------------------------------------------------------ valuation
  /** conservative liquidation value: what the legs would sell for at the current best bid */
  legValue(symbol: string, qty: number): { bid: number; mark: number } {
    const c = this.market.contracts.get(symbol);
    const q = this.market.quotes.get(symbol);
    if (c && c.expiry <= Date.now()) {
      const px = this.market.settlements.get(symbol) ?? this.market.spot(c.underlying);
      const v = intrinsic(c, px) * qty;
      return { bid: v, mark: v };
    }
    return { bid: (q?.bid ?? 0) * qty, mark: (q?.mark ?? 0) * qty };
  }

  positionValue(p: Position) {
    return p.legs.reduce((a, l) => {
      const v = this.legValue(l.symbol, l.qty);
      return { bid: a.bid + v.bid, mark: a.mark + v.mark };
    }, { bid: 0, mark: 0 });
  }

  equity(): { bid: number; mark: number } {
    let bid = this.state.cash;
    let mark = this.state.cash;
    for (const p of this.state.positions) {
      const v = this.positionValue(p);
      bid += v.bid;
      mark += v.mark;
    }
    return { bid, mark };
  }

  // ------------------------------------------------------------ trading
  private record(p: Position, c: Contract, side: 'BUY' | 'SELL', x: Execution, reason: string) {
    const slip = x.touch > 0 ? ((side === 'BUY' ? x.avgPrice - x.touch : x.touch - x.avgPrice) / x.touch) * 1e4 : 0;
    this.journal({ time: Date.now(), mode: this.broker.kind, positionId: p.id, strategy: p.strategy, symbol: c.symbol, side, qty: x.filledQty, price: x.avgPrice, fee: x.fee, touch: x.touch, slippageBp: slip, reason, orderId: x.orderId });
    this.state.feesPaid += x.fee;
  }

  private async open(plan: Plan): Promise<string | null> {
    const eq = this.equity().bid;
    const openCost = this.state.positions.reduce((a, p) => a + p.cost, 0);
    const budget = Math.min(eq * CONFIG.risk.perTrade, eq * CONFIG.risk.maxOpenPremium - openCost, this.state.cash * 0.98);
    if (budget <= 0) return 'אין תקציב פנוי';
    // price one "set" (1 contract per leg) at the ask, plus fees
    let setCost = 0;
    for (const c of plan.legs) {
      const q = this.market.quotes.get(c.symbol);
      if (!q || q.ask <= 0 || q.bid <= 0) return `${c.symbol}: אין ציטוט דו-צדדי`;
      const spread = (q.ask - q.bid) / ((q.ask + q.bid) / 2);
      if (spread > CONFIG.risk.maxSpreadPct) return `${c.symbol}: מרווח ${(spread * 100).toFixed(1)}% גבוה מהמותר`;
      setCost += q.ask * (1 + CONFIG.risk.maxSlippage) + tradeFee(c, this.market.spot(c.underlying), q.ask, 1);
    }
    const step = Math.max(...plan.legs.map((c) => c.step));
    let qty = floorTo(budget / setCost, step);
    // size to what the real books can fill inside the limit on every leg
    for (const c of plan.legs) {
      const q = this.market.quotes.get(c.symbol)!;
      const avail = await this.broker.fillable({ contract: c, side: 'BUY', qty, limit: q.ask * (1 + CONFIG.risk.maxSlippage) });
      qty = Math.min(qty, floorTo(avail, step));
    }
    const minQty = Math.max(...plan.legs.map((c) => c.minQty));
    if (qty < minQty) return `כמות ${qty} קטנה מהמינימום ${minQty} (תקציב ${budget.toFixed(0)}$ / עומק ספר)`;

    const pos: Position = { id: randomUUID().slice(0, 8), strategy: plan.strategy, underlying: plan.underlying, legs: [], openedAt: Date.now(), cost: 0, note: plan.reason, bestPnlPct: 0 };
    for (const c of plan.legs) {
      const q = this.market.quotes.get(c.symbol)!;
      const x = await this.broker.execute({ contract: c, side: 'BUY', qty, limit: q.ask * (1 + CONFIG.risk.maxSlippage) });
      if (!x.ok) {
        this.event('warn', `כניסה ${HE[plan.strategy]} ${c.symbol} לא בוצעה: ${x.reason}`);
        break;
      }
      const paid = x.avgPrice * x.filledQty + x.fee;
      this.state.cash -= paid;
      pos.cost += paid;
      pos.legs.push({ symbol: c.symbol, qty: x.filledQty, entryPrice: x.avgPrice, entryFee: x.fee });
      this.record(pos, c, 'BUY', x, `כניסה: ${plan.reason}`);
    }
    if (!pos.legs.length) return 'אף רגל לא בוצעה';
    this.state.positions.push(pos);
    if (pos.legs.length < plan.legs.length) this.event('warn', `פוזיציה ${pos.id} נפתחה חלקית (${pos.legs.length}/${plan.legs.length} רגליים) — תנוהל כפי שהיא`);
    this.event('info', `פתיחה ${HE[plan.strategy]} ${plan.underlying} · עלות ${pos.cost.toFixed(2)}$ · ${plan.reason}`);
    return null;
  }

  private async close(p: Position, reason: string): Promise<void> {
    for (const l of [...p.legs]) {
      const c = this.market.contracts.get(l.symbol);
      if (!c || c.expiry <= Date.now()) continue; // expired legs settle, they can't be sold
      const q = this.market.quotes.get(l.symbol);
      if (!q || q.bid <= 0) {
        this.event('warn', `יציאה ${l.symbol}: אין ביד בספר — נשאר פתוח`);
        continue;
      }
      const x = await this.broker.execute({ contract: c, side: 'SELL', qty: l.qty, limit: q.bid * (1 - CONFIG.risk.maxSlippage) });
      if (!x.ok) {
        this.event('warn', `יציאה ${l.symbol} לא בוצעה: ${x.reason}`);
        continue;
      }
      const got = x.avgPrice * x.filledQty - x.fee;
      this.state.cash += got;
      p.proceeds = (p.proceeds ?? 0) + got;
      l.qty = floorTo(l.qty - x.filledQty, c.step);
      this.record(p, c, 'SELL', x, reason);
    }
    p.legs = p.legs.filter((l) => l.qty > 1e-12);
    if (!p.legs.length) this.finalize(p, reason);
  }

  private finalize(p: Position, reason: string) {
    const proceeds = p.proceeds ?? 0;
    const pnl = proceeds - p.cost;
    const fees = this.state.fills.filter((f) => f.positionId === p.id).reduce((a, f) => a + f.fee, 0);
    const t: ClosedTrade = { id: p.id, strategy: p.strategy, underlying: p.underlying, openedAt: p.openedAt, closedAt: Date.now(), cost: p.cost, proceeds, fees, pnl, pnlPct: p.cost > 0 ? pnl / p.cost : 0, exitReason: reason, note: p.note };
    this.state.closed.unshift(t);
    if (this.state.closed.length > 1000) this.state.closed.length = 1000;
    this.state.positions = this.state.positions.filter((x) => x !== p);
    this.event(pnl >= 0 ? 'info' : 'warn', `סגירה ${HE[p.strategy]} ${p.underlying} · ${reason} · רו״ה ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}$ (${(t.pnlPct * 100).toFixed(1)}%)`);
  }

  /** settle expired legs at Binance's published settlement price (exerciseHistory.realStrikePrice) */
  private async settle(): Promise<void> {
    const now = Date.now();
    const expired = this.state.positions.flatMap((p) => p.legs.map((l) => ({ p, l, c: this.market.contracts.get(l.symbol) }))).filter((x) => !x.c || x.c.expiry <= now);
    if (!expired.length) return;
    if (now - this.lastSettlementPoll > 60e3) {
      this.lastSettlementPoll = now;
      try {
        await this.market.refreshSettlements(now - 3 * DAY);
      } catch (e) {
        this.market.noteError(`exerciseHistory: ${e instanceof Error ? e.message : e}`);
      }
    }
    for (const { p, l, c } of expired) {
      const px = this.market.settlements.get(l.symbol);
      if (!c || px === undefined) {
        p.awaitingSettlement = true;
        continue;
      }
      const value = intrinsic(c, px);
      const fee = exerciseFee(c, px, value, l.qty);
      const got = value * l.qty - fee;
      this.state.cash += got;
      this.state.feesPaid += fee;
      p.proceeds = (p.proceeds ?? 0) + got;
      this.journal({ time: now, mode: this.broker.kind, positionId: p.id, strategy: p.strategy, symbol: l.symbol, side: 'SETTLE', qty: l.qty, price: value, fee, touch: px, slippageBp: 0, reason: `פקיעה · מחיר סילוק Binance ${px}` });
      l.qty = 0;
    }
    for (const p of [...this.state.positions]) {
      p.legs = p.legs.filter((l) => l.qty > 0);
      if (!p.legs.length) this.finalize(p, 'פקיעה וסילוק');
    }
  }

  private async manageExits(): Promise<void> {
    const ex = CONFIG.exits;
    for (const p of [...this.state.positions]) {
      if (p.awaitingSettlement) continue;
      const v = this.positionValue(p).bid;
      // include cash already received from partial exits
      const pnlPct = p.cost > 0 ? (v + (p.proceeds ?? 0) - p.cost) / p.cost : 0;
      p.bestPnlPct = Math.max(p.bestPnlPct, pnlPct);
      const nextExpiry = Math.min(...p.legs.map((l) => this.market.contracts.get(l.symbol)?.expiry ?? 0));
      const hoursLeft = (nextExpiry - Date.now()) / 3600e3;
      let reason: string | null = null;
      if (pnlPct >= ex.takeProfit) reason = `מימוש רווח +${(pnlPct * 100).toFixed(0)}%`;
      else if (pnlPct <= -ex.stopLoss) reason = `סטופ לוס ${(pnlPct * 100).toFixed(0)}%`;
      else if (p.bestPnlPct >= ex.trailArm && pnlPct <= ex.trailFloor) reason = `סטופ נגרר (שיא +${(p.bestPnlPct * 100).toFixed(0)}%)`;
      else if (hoursLeft < ex.closeHoursBeforeExpiry && hoursLeft > 0) reason = `סגירה לפני פקיעה (${hoursLeft.toFixed(1)} ש׳)`;
      else if ((Date.now() - p.openedAt) / 3600e3 > ex.maxHoldHours) reason = 'זמן החזקה מקסימלי';
      if (reason) await this.close(p, reason);
    }
  }

  private checkRisk(eq: number) {
    const r = CONFIG.risk;
    if (this.state.dayStart.day !== today()) this.state.dayStart = { day: today(), equity: eq };
    this.state.peakEquity = Math.max(this.state.peakEquity, eq);
    const dd = 1 - eq / this.state.peakEquity;
    if (!this.state.halted && dd >= r.maxDrawdown) {
      this.state.halted = true;
      this.state.haltReason = `ירידה של ${(dd * 100).toFixed(1)}% מהשיא — כניסות חדשות נעצרו עד חידוש ידני`;
      this.event('error', this.state.haltReason);
    }
    const dayLoss = 1 - eq / this.state.dayStart.equity;
    if (dayLoss >= r.dailyLossLimit && this.state.entriesPausedUntil < (today() + 1) * DAY) {
      this.state.entriesPausedUntil = (today() + 1) * DAY;
      this.event('warn', `הפסד יומי ${(dayLoss * 100).toFixed(1)}% — אין כניסות חדשות עד חצות UTC`);
    }
  }

  private entryBlock(u: string): string | null {
    const r = CONFIG.risk;
    if (this.state.halted) return 'הבוט עצור (ירידה מקסימלית)';
    if (Date.now() < this.state.entriesPausedUntil) return 'מגבלת הפסד יומי';
    if (this.state.positions.length >= r.maxPositions) return 'מקסימום פוזיציות';
    if (this.state.positions.filter((p) => p.underlying === u).length >= r.maxPerUnderlying) return `מקסימום פוזיציות ב-${u}`;
    if (Date.now() - this.market.lastQuotes > 60e3) return 'נתוני שוק לא עדכניים';
    return null;
  }

  private async maybeEnter(): Promise<void> {
    const plans = candidates(this.market).filter((p) => p.score > 0);
    for (const plan of plans.slice(0, 3)) {
      const dup = this.state.positions.some((p) => p.underlying === plan.underlying && p.strategy === plan.strategy);
      const block = dup ? 'כבר קיימת פוזיציה זהה' : this.entryBlock(plan.underlying);
      const sig: Signal = { time: Date.now(), underlying: plan.underlying, strategy: plan.strategy, score: plan.score, reason: plan.reason, action: 'skipped', skipReason: block ?? undefined };
      if (!block) {
        const err = await this.open(plan);
        if (err) sig.skipReason = err;
        else sig.action = 'entered';
      }
      this.state.signals.unshift(sig);
      if (this.state.signals.length > 100) this.state.signals.length = 100;
      if (sig.action === 'entered') break; // one entry per decision cycle
    }
  }

  /** one cycle: refresh data, settle, exits, (entries), risk, persist */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.market.refreshQuotes();
      await this.settle();
      await this.manageExits();
      const eq = this.equity().bid;
      this.checkRisk(eq);
      if (Date.now() - this.lastDecision >= CONFIG.decisionMs) {
        this.lastDecision = Date.now();
        await this.maybeEnter();
      }
      const e = this.equity().bid;
      const last = this.state.equity[this.state.equity.length - 1];
      if (!last || Date.now() - last.t >= 60e3) {
        this.state.equity.push({ t: Date.now(), equity: e });
        if (this.state.equity.length > 20000) this.state.equity = this.state.equity.filter((_, i) => i % 2 === 0);
      }
      this.save();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.market.noteError(msg);
      this.event('error', `מחזור נכשל: ${msg}`);
    } finally {
      this.busy = false;
    }
  }

  async control(action: string): Promise<string> {
    switch (action) {
      case 'resume':
        this.state.halted = false;
        this.state.haltReason = '';
        this.state.peakEquity = this.equity().bid;
        this.event('info', 'חידוש מסחר ידני');
        return 'ok';
      case 'halt':
        this.state.halted = true;
        this.state.haltReason = 'נעצר ידנית';
        this.event('warn', 'עצירה ידנית');
        return 'ok';
      case 'closeAll':
        for (const p of [...this.state.positions]) await this.close(p, 'סגירה ידנית של הכל');
        this.save();
        return 'ok';
      default:
        return 'unknown action';
    }
  }
}
