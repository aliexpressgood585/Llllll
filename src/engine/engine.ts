import { bsGreeks, intrinsic } from '../lib/blackScholes';
import { fmtCompactUsd, fmtNum, fmtUsd } from '../lib/format';
import { Rng } from '../lib/rng';
import { ASSETS, ASSET_LIST, RISK, RISK_FREE, SIM_MINUTES_PER_STEP, START_CAPITAL, STEPS_PER_HOUR, STRATEGY_NAMES, STRATEGY_RULES } from './config';
import { ExecutionVenue, SimExecution } from './execution';
import { exerciseFee } from './fees';
import { MarketSim, instrumentSymbol, shortSymbol, surfaceIv, theoPrice } from './market';
import { RegimeEngine, argmaxRegime } from './regime';
import { StrategyPlan, buildPlan, candidates } from './strategies';
import { MS, dteLabel, yearsTo } from './time';
import {
  GreekTotals,
  Surfaces,
  initialMargin,
  legGreeks,
  maintenanceMargin,
  monteCarloVar,
  portfolioValue,
  shockSurfaces,
  strategyGreeks,
  strategyValue,
  surfacesOf,
} from './valuation';
import type {
  AccountLiqEvent,
  Alert,
  Asset,
  EquityPoint,
  ExecStats,
  Fill,
  Leg,
  LiquidationCluster,
  MarketLiqEvent,
  Quote,
  Regime,
  RegimeProbs,
  Severity,
  Strategy,
  StrategyKind,
} from './types';

export interface ChainRow extends Quote {
  dte: string;
  position: number;
  upnl: number;
}

export interface StrategyView {
  id: string;
  kind: StrategyKind;
  asset: Asset;
  label: string;
  tag: string;
  legs: number;
  units: number;
  size: number;
  pnl: number;
  pnlPct: number;
  dayPnl: number;
  theta: number;
  vega: number;
  delta: number;
  im: number;
  riskCapital: number;
  ageHours: number;
  tp: number;
  sl: number;
  note: string;
}

export interface AssetView {
  asset: Asset;
  spot: number;
  change24h: number;
  atmIv: number;
  longIv: number;
  realizedVol: number;
  ivRank: number;
  ivPercentile: number;
  skew: number;
  funding: number;
  perpOi: number;
  liq1hLong: number;
  liq1hShort: number;
  clusters: LiquidationCluster[];
  cascadeRiskDown: number;
  cascadeRiskUp: number;
  nearestLong: LiquidationCluster | null;
  nearestShort: LiquidationCluster | null;
  spark: number[];
}

export interface GexView {
  totalAsset: number;
  totalUsd: number;
  flip: number | null;
  pinning: number[];
  highestStrike: number;
  profile: { strike: number; gex: number }[];
}

export interface SurfaceView {
  moneyness: number[];
  days: number[];
  iv: number[][]; // [dayIdx][moneyIdx]
}

export interface DeskSnapshot {
  now: number;
  stepN: number;
  attempt: number;
  blowups: number;
  blowup: { active: boolean; secondsLeft: number; lastPeak: number };
  attemptsLog: { attempt: number; peak: number; hours: number; cause: string }[];
  kindStats: { kind: StrategyKind; n: number; pnl: number; wins: number }[];
  account: {
    equity: number;
    cash: number;
    start: number;
    dayPnl: number;
    dayPnlPct: number;
    totalPnl: number;
    totalReturn: number;
    sharpe: number | null;
    maxDD: number;
    maxDDUsd: number;
    peak: number;
    realized: number;
    fees: number;
    im: number;
    mm: number;
    marginUtil: number;
    marginRatio: number;
    available: number;
    liqCount: number;
    trades: number;
    wins: number;
    losses: number;
  };
  regime: { probs: Record<Asset, RegimeProbs>; call: Record<Asset, Regime>; hidden: Regime; confidence: number };
  assets: Record<Asset, AssetView>;
  chains: Record<Asset, ChainRow[]>;
  expiries: number[];
  surfaces: Record<Asset, SurfaceView>;
  gex: Record<Asset, GexView>;
  strategies: StrategyView[];
  greeks: GreekTotals & { deltaBtc: number; vegaNotional: number };
  greeksByAsset: Record<Asset, GreekTotals>;
  scenario: { spotMoves: number[]; ivShifts: number[]; grid: number[][] };
  risk: {
    var95: number;
    es95: number;
    im: number;
    imStress: number;
    imIncrease: number;
    capitalAtRisk: number;
    liqDown: number | null;
    liqUp: number | null;
  };
  allocation: { kind: StrategyKind; margin: number; vega: number; count: number }[];
  exec: { avgSlipBp: number; fillRate: number; avgLatency: number; rejectRate: number; fees: number; lastLatency: number; fills: number };
  system: { circuit: 'ARMED' | 'TRIPPED'; circuitMinutesLeft: number; latencyGuardMs: number; feedLagMs: number };
  equity: EquityPoint[];
  liqMarks: { t: number; equity: number }[];
  fills: Fill[];
  alerts: Alert[];
  marketLiqs: MarketLiqEvent[];
  accountLiqs: AccountLiqEvent[];
}

let uid = 0;
const nextId = (p: string) => `${p}${(++uid).toString(36)}`;

export class DeskEngine {
  now: number;
  stepN = 0;
  market: MarketSim;
  regimeEngine = new RegimeEngine();
  private rng: Rng;
  private riskRng: Rng;
  private exec: ExecutionVenue;

  cash = START_CAPITAL;
  attempt = 1;
  blowups = 0;
  strategies: Strategy[] = [];
  private imCache = new Map<string, number>();
  fills: Fill[] = [];
  alerts: Alert[] = [];
  equity: EquityPoint[] = [];
  liqMarks: { t: number; equity: number }[] = [];
  accountLiqs: AccountLiqEvent[] = [];
  attemptsLog: { attempt: number; peak: number; hours: number; cause: string }[] = [];
  execStats: ExecStats = { attempts: 0, fills: 0, rejects: 0, slippageBpSum: 0, latencySum: 0, feeSum: 0, latencyLast: 0 };
  private peak = START_CAPITAL;
  private maxDD = 0;
  private maxDDUsd = 0;
  private dayStartEquity = START_CAPITAL;
  private dayHighEquity = START_CAPITAL;
  private hourlyRets: number[] = [];
  private lastHourEquity = START_CAPITAL;
  private circuitUntil = 0;
  private lastEntryStep = -999;
  private blowupCountdown = 0;
  private attemptStart: number;
  private stats = { trades: 0, wins: 0, losses: 0, realized: 0, fees: 0, liqCount: 0 };
  kindStats: Partial<Record<StrategyKind, { n: number; pnl: number; wins: number }>> = {};
  private alertSeq = 0;
  private lastCall: Record<Asset, Regime> = { BTC: 'NEUTRAL', ETH: 'NEUTRAL', SOL: 'NEUTRAL' };
  private lastMarginAlert = 0;
  private lastPreTradeAlert = 0;

  constructor(seed = Date.now() & 0xffffffff) {
    this.rng = new Rng(seed);
    this.riskRng = new Rng(seed ^ 0x9e3779b9);
    this.now = Math.floor(Date.now() / 60e3) * 60e3;
    this.attemptStart = this.now;
    this.market = new MarketSim(this.rng, this.now);
    this.exec = new SimExecution(this.market, this.rng);
    // warm up market + regime engine for a few sim hours so panels are populated on load
    for (let i = 0; i < STEPS_PER_HOUR * 6; i++) {
      this.now += SIM_MINUTES_PER_STEP * 60e3;
      this.market.step(this.now);
      this.regimeEngine.update(this.market);
    }
    this.market.liqEvents = [];
    this.attemptStart = this.now;
    this.equity.push({ t: this.now, equity: START_CAPITAL, dd: 0 });
    this.alert(`DESK ONLINE — capital ${fmtUsd(START_CAPITAL)} · aggression HIGH · max margin util ${(RISK.maxMarginUtil * 100).toFixed(0)}%`, 'LOW');
  }

  // ------------------------------------------------------------------ helpers
  private alert(text: string, severity: Severity) {
    this.alerts.unshift({ id: ++this.alertSeq, time: this.now, text, severity });
    if (this.alerts.length > 60) this.alerts.length = 60;
  }

  surfaces(): Surfaces {
    return surfacesOf(this.market);
  }

  equityNow(s: Surfaces = this.surfaces()): number {
    return this.cash + portfolioValue(this.strategies, s, this.now);
  }

  private refreshMargins(s: Surfaces) {
    this.imCache.clear();
    let im = 0;
    for (const st of this.strategies) {
      const v = initialMargin(st, s, this.now);
      this.imCache.set(st.id, v);
      im += v;
    }
    return { im, mm: maintenanceMargin(im) };
  }

  private recordFill(st: Strategy, l: { asset: Asset; expiry: number; strike: number; type: 'C' | 'P' }, qty: number, price: number, touch: number, venue: Fill['venue'], fee: number, slip: number, lat: number, pnl: number | null, action: Fill['action']) {
    this.fills.unshift({
      time: this.now,
      strategyId: st.id,
      strategyTag: st.tag,
      strategyLabel: st.label,
      side: qty > 0 ? 'B' : 'S',
      instrument: instrumentSymbol(l),
      asset: l.asset,
      expiry: l.expiry,
      strike: l.strike,
      type: l.type,
      qty: Math.abs(qty),
      price,
      touch,
      venue,
      fee,
      slippageBp: slip,
      latencyMs: lat,
      pnl,
      action,
    });
    if (this.fills.length > 120) this.fills.length = 120;
  }

  /** Execute one leg trade; mutates cash + strategy cash flow. Returns null on reject. */
  private trade(st: Strategy, key: { asset: Asset; expiry: number; strike: number; type: 'C' | 'P' }, qty: number, action: Fill['action'], entryForPnl?: number, venuePref?: Fill['venue']) {
    const liquidation = action === 'LIQ';
    this.execStats.attempts++;
    const r = this.exec.execute({ ...key, qty, liquidation, preferVenue: venuePref }, this.now);
    this.execStats.latencyLast = r.latencyMs;
    this.execStats.latencySum += r.latencyMs;
    if (!r.ok) {
      this.execStats.rejects++;
      return null;
    }
    this.execStats.fills++;
    this.execStats.slippageBpSum += r.slippageBp;
    this.execStats.feeSum += r.fee;
    const flow = -r.price * qty - r.fee;
    this.cash += flow;
    st.cashFlow += flow;
    st.fees += r.fee;
    this.stats.fees += r.fee;
    const pnl = entryForPnl !== undefined ? (r.price - entryForPnl) * -qty - r.fee : null;
    this.recordFill(st, key, qty, r.price, r.touch, r.venue, r.fee, r.slippageBp, r.latencyMs, pnl, action);
    return r;
  }

  // ------------------------------------------------------------------ lifecycle
  private finalize(st: Strategy, reason: string) {
    this.strategies = this.strategies.filter((x) => x !== st);
    const pnl = st.cashFlow;
    this.stats.trades++;
    this.stats.realized += pnl;
    const ks = (this.kindStats[st.kind] ??= { n: 0, pnl: 0, wins: 0 });
    ks.n++;
    ks.pnl += pnl;
    if (pnl >= 0) ks.wins++;
    if (pnl >= 0) this.stats.wins++;
    else this.stats.losses++;
    const pct = st.riskCapital > 0 ? pnl / st.riskCapital : 0;
    const sev: Severity = pnl < -0.15 * this.equityNow() ? 'HIGH' : Math.abs(pct) > 0.4 ? 'MEDIUM' : 'LOW';
    this.alert(`${reason}: ${st.label} ${pnl >= 0 ? '+' : ''}${fmtUsd(pnl, 0)} (${(pct * 100).toFixed(0)}% of risk)`, sev);
  }

  closeStrategy(st: Strategy, reason: string, liquidation = false): boolean {
    for (const l of [...st.legs]) {
      const r = this.trade(st, l, -l.qty, liquidation ? 'LIQ' : 'CLOSE', l.entryPrice, l.venue);
      if (!r) continue;
      st.legs = st.legs.filter((x) => x !== l);
    }
    if (!st.legs.length) {
      this.finalize(st, reason);
      return true;
    }
    return false;
  }

  private openPlan(plan: StrategyPlan, units: number, riskCapital: number, entryRegime: Regime) {
    const c = ASSETS[plan.asset];
    const st: Strategy = {
      id: nextId('S'),
      kind: plan.kind,
      asset: plan.asset,
      label: plan.label,
      tag: plan.tag,
      legs: [],
      openedAt: this.now,
      cashFlow: 0,
      fees: 0,
      riskCapital,
      entryRegime,
      entryNote: plan.note,
      units,
      dayPnlAnchor: 0,
    };
    // buy legs first (reduces naked exposure if a later leg is rejected)
    const ordered = [...plan.legs].sort((a, b) => b.ratio - a.ratio);
    for (const ls of ordered) {
      const qty = +(ls.ratio * units * c.minQty).toFixed(6);
      const r = this.trade(st, ls, qty, 'OPEN');
      if (!r) {
        this.alert(`LEG REJECT ${shortSymbol(ls)} — unwinding ${st.legs.length} filled leg(s) of ${plan.label}`, 'MEDIUM');
        this.strategies.push(st);
        if (st.legs.length) this.closeStrategy(st, 'LEG-RISK UNWIND');
        else this.strategies = this.strategies.filter((x) => x !== st);
        return;
      }
      st.legs.push({ id: nextId('L'), asset: ls.asset, expiry: ls.expiry, strike: ls.strike, type: ls.type, qty, entryPrice: r.price, venue: r.venue });
    }
    st.dayPnlAnchor = 0;
    this.strategies.push(st);
    const credit = st.cashFlow > 0;
    this.alert(`OPEN ${plan.label} ×${units} — ${credit ? 'credit' : 'debit'} ${fmtUsd(Math.abs(st.cashFlow), 0)} · risk ${fmtUsd(riskCapital, 0)} · ${plan.note}`, 'LOW');
  }

  private settleExpiries() {
    for (const st of [...this.strategies]) {
      const expired = st.legs.filter((l) => l.expiry <= this.now);
      if (!expired.length) continue;
      for (const l of expired) {
        const S = this.market.assets[l.asset].spot;
        const iv = intrinsic(S, l.strike, l.type);
        const fee = l.qty > 0 ? exerciseFee(l.venue, S, l.qty, iv) : 0;
        const flow = iv * l.qty - fee;
        this.cash += flow;
        st.cashFlow += flow;
        st.fees += fee;
        this.stats.fees += fee;
        this.recordFill(st, l, -l.qty, iv, iv, l.venue, fee, 0, 0, (iv - l.entryPrice) * l.qty - fee, 'EXPIRY');
        if (l.qty < 0 && iv > 0) this.alert(`SHORT ${shortSymbol(l)} EXPIRED ITM — settled ${fmtUsd(iv * l.qty, 0)} @ ${fmtNum(S, ASSETS[l.asset].decimals)}`, 'MEDIUM');
      }
      st.legs = st.legs.filter((l) => l.expiry > this.now);
      if (!st.legs.length) this.finalize(st, 'EXPIRY SETTLED');
    }
  }

  private checkLiquidation(s: Surfaces) {
    let { im, mm } = this.refreshMargins(s);
    let equity = this.equityNow(s);
    if (mm > 0 && equity < mm * 1.25 && this.now - this.lastMarginAlert > MS.HOUR) {
      this.lastMarginAlert = this.now;
      this.alert(`MARGIN CALL — equity ${fmtUsd(equity)} vs maintenance ${fmtUsd(mm)} (${((mm / Math.max(equity, 1)) * 100).toFixed(0)}% MR)`, 'HIGH');
    }
    if (mm <= 0 || equity >= mm) return;
    // forced liquidation: close biggest margin consumers until back above IM×MM buffer
    let guard = 0;
    while (this.strategies.length && equity < mm * 1.15 && guard++ < 10) {
      const target = [...this.strategies].sort((a, b) => (this.imCache.get(b.id) ?? 0) - (this.imCache.get(a.id) ?? 0))[0];
      const before = this.equityNow(s);
      const feesBefore = target.fees;
      const pnlBefore = target.cashFlow + strategyValue(target, s, this.now);
      this.closeStrategy(target, 'LIQUIDATED', true);
      this.strategies = this.strategies.filter((x) => x !== target || x.legs.length);
      equity = this.equityNow(s);
      this.stats.liqCount++;
      const ev: AccountLiqEvent = { time: this.now, strategy: target.label, lossUsd: pnlBefore + (equity - before), feeUsd: target.fees - feesBefore, equityAfter: equity, reason: `equity ${fmtUsd(before)} < MM ${fmtUsd(mm)}` };
      this.accountLiqs.unshift(ev);
      if (this.accountLiqs.length > 30) this.accountLiqs.length = 30;
      this.liqMarks.push({ t: this.now, equity });
      this.alert(`⚠ FORCED LIQUIDATION ${target.label} — P&L ${fmtUsd(ev.lossUsd)} · liq fee ${fmtUsd(ev.feeUsd, 2)} · equity ${fmtUsd(equity)}`, 'CRITICAL');
      ({ im, mm } = this.refreshMargins(s));
    }
    void im;
  }

  private checkBlowup(s: Surfaces) {
    const eq = this.equityNow(s);
    if (eq > START_CAPITAL * RISK.blowupThreshold) return;
    for (const st of [...this.strategies]) this.closeStrategy(st, 'BLOWUP LIQ', true);
    this.strategies = [];
    const after = this.equityNow(s);
    if (after < 0) {
      this.alert(`NEGATIVE BALANCE ${fmtUsd(after)} absorbed by insurance fund`, 'CRITICAL');
      this.cash -= after;
    }
    this.blowups++;
    this.liqMarks.push({ t: this.now, equity: Math.max(0, after) });
    this.attemptsLog.unshift({ attempt: this.attempt, peak: this.peak, hours: (this.now - this.attemptStart) / MS.HOUR, cause: this.accountLiqs[0]?.strategy ?? 'drawdown' });
    if (this.attemptsLog.length > 8) this.attemptsLog.length = 8;
    this.blowupCountdown = RISK.resetAfterSteps;
    this.alert(`ACCOUNT #${this.attempt} WIPED OUT — peak ${fmtUsd(this.peak)} → ${fmtUsd(Math.max(0, after))}. Re-seeding ${fmtUsd(START_CAPITAL)}.`, 'CRITICAL');
  }

  private resetAccount() {
    this.attempt++;
    this.cash = START_CAPITAL;
    this.strategies = [];
    this.peak = START_CAPITAL;
    this.maxDD = 0;
    this.maxDDUsd = 0;
    this.dayStartEquity = START_CAPITAL;
    this.dayHighEquity = START_CAPITAL;
    this.hourlyRets = [];
    this.lastHourEquity = START_CAPITAL;
    this.circuitUntil = 0;
    this.equity = [{ t: this.now, equity: START_CAPITAL, dd: 0 }];
    this.liqMarks = [];
    this.attemptStart = this.now;
    this.stats = { trades: 0, wins: 0, losses: 0, realized: 0, fees: 0, liqCount: 0 };
    this.kindStats = {};
    this.alert(`ACCOUNT #${this.attempt} FUNDED ${fmtUsd(START_CAPITAL)} — strategies re-armed`, 'MEDIUM');
  }

  private signalContext(a: Asset) {
    const m = this.market.assets[a];
    const probs = this.regimeEngine.probs[a];
    const hist = m.ivHistory;
    const lo = Math.min(...hist, m.atmIv);
    const hi = Math.max(...hist, m.atmIv);
    const ivRank = hi > lo ? (m.atmIv - lo) / (hi - lo) : 0.5;
    const f = this.regimeEngine.features(this.market, a);
    const cr = this.cascadeRisk(a);
    return { probs, ivRank, termSpread: m.atmIv - m.longIv, cascadeRisk: Math.min(1, Math.max(cr.down, cr.up)), momentum: f.z1 };
  }

  cascadeRisk(a: Asset) {
    const m = this.market.assets[a];
    const depth = ASSETS[a].liqDepthPer1Pct;
    let down = 0;
    let up = 0;
    for (const cl of m.clusters) {
      const d = Math.abs(cl.price / m.spot - 1);
      if (d > 0.03) continue;
      if (cl.side === 'LONG') down += cl.notional;
      else up += cl.notional;
    }
    // probability-like: notional within 3% relative to 2% of depth
    return { down: Math.min(1, down / (depth * 2)), up: Math.min(1, up / (depth * 2)) };
  }

  private manageExits(s: Surfaces) {
    for (const st of [...this.strategies]) {
      const rule = STRATEGY_RULES[st.kind];
      const pnl = st.cashFlow + strategyValue(st, s, this.now);
      const probs = this.regimeEngine.probs[st.asset];
      const ageH = (this.now - st.openedAt) / MS.HOUR;
      let reason: string | null = null;
      if (pnl >= rule.tp * st.riskCapital) reason = 'TAKE PROFIT';
      else if (pnl <= -rule.sl * st.riskCapital) reason = 'STOP LOSS';
      else if (ageH > rule.maxHoldHours) reason = 'TIME EXIT';
      else if ((st.kind === 'IRON_CONDOR' || st.kind === 'SHORT_STRANGLE') && probs.EXTREME > 0.42) reason = 'VOL REGIME EXIT';
      else if (st.kind === 'LONG_STRADDLE' && ageH > 3 && probs.EXTREME < 0.08 && probs.NEUTRAL > 0.6) reason = 'REGIME DECAY EXIT';
      else if ((st.kind === 'DIRECTIONAL' || st.kind === 'RISK_REVERSAL') && ageH > 1) {
        const long = st.legs.some((l) => (l.type === 'C' && l.qty > 0) || (l.type === 'P' && l.qty < 0));
        if ((long && probs.BEAR > 0.55) || (!long && probs.BULL > 0.55)) reason = 'REGIME FLIP';
      }
      if (!reason) {
        const next = Math.min(...st.legs.map((l) => l.expiry));
        const shortItm = st.legs.some((l) => l.qty < 0 && l.expiry === next && intrinsic(s[l.asset].spot, l.strike, l.type) > 0);
        if (next - this.now < 25 * 60e3 && shortItm) reason = 'PIN-RISK EXIT';
      }
      if (reason) this.closeStrategy(st, reason);
    }
  }

  private maybeEnter(s: Surfaces) {
    if (this.now < this.circuitUntil) return;
    if (this.stepN - this.lastEntryStep < RISK.entryCooldownSteps) return;
    if (this.strategies.length >= RISK.maxStrategies) return;
    if (this.execStats.latencyLast > 250) return; // latency guard
    const equity = this.equityNow(s);
    if (equity <= 0) return;
    const curIm = [...this.imCache.values()].reduce((a, b) => a + b, 0);
    if (curIm / equity > RISK.maxMarginUtil * 0.9) return;

    let best: { plan: StrategyPlan; score: number; regime: Regime } | null = null;
    for (const a of ASSET_LIST) {
      if (this.strategies.filter((x) => x.asset === a).length >= RISK.maxPerAsset) continue;
      const ctx = this.signalContext(a);
      for (const cand of candidates(a, ctx, this.rng).slice(0, 2)) {
        if (this.strategies.some((x) => x.asset === a && x.kind === cand.kind)) continue;
        if (cand.score < 0.85) continue;
        if (!best || cand.score > best.score) {
          const plan = buildPlan(cand.kind, a, this.market, this.now, cand.bias);
          plan.note = cand.note;
          best = { plan, score: cand.score, regime: argmaxRegime(ctx.probs) };
        }
      }
    }
    if (!best) return;
    this.lastEntryStep = this.stepN;
    const { plan } = best;
    const c = ASSETS[plan.asset];

    // per-unit sizing from executable prices and risk-based margin
    const probe: Strategy = {
      id: 'probe', kind: plan.kind, asset: plan.asset, label: '', tag: '', openedAt: this.now, cashFlow: 0, fees: 0, riskCapital: 0, entryRegime: 'NEUTRAL', entryNote: '', units: 1, dayPnlAnchor: 0,
      legs: plan.legs.map((l): Leg => ({ id: 'p', asset: l.asset, expiry: l.expiry, strike: l.strike, type: l.type, qty: l.ratio * c.minQty, entryPrice: 0, venue: 'BINANCE' })),
    };
    let unitDebit = 0;
    for (const l of plan.legs) {
      const q = this.market.quote(l, this.now);
      unitDebit += (l.ratio > 0 ? q.ask : -q.bid) * c.minQty;
    }
    const unitIm = initialMargin(probe, s, this.now);
    const unitRisk = STRATEGY_RULES[plan.kind].credit ? Math.max(unitIm, 1e-9) : Math.max(unitDebit, unitIm, 1e-9);
    const budget = equity * RISK.perTradeBudget;
    const marginRoom = unitIm > 0 ? (RISK.maxMarginUtil * equity - curIm) / unitIm : Infinity;
    // premium must be paid from free cash: long option value is not collateral
    const cashRoom = unitDebit > 0 ? (Math.min(equity, this.cash) - curIm) / unitDebit : Infinity;
    const units = Math.floor(Math.min(budget / unitRisk, marginRoom, cashRoom, 80));
    if (units < 1) {
      if (this.now - this.lastPreTradeAlert > 2 * MS.HOUR) {
        this.lastPreTradeAlert = this.now;
        this.alert(`PRE-TRADE BLOCK ${plan.label}: insufficient free margin (${fmtUsd(unitRisk, 0)}/unit)`, 'LOW');
      }
      return;
    }
    this.openPlan(plan, units, unitRisk * units, best.regime);
  }

  // ------------------------------------------------------------------ main loop
  step(): void {
    const prev = this.now;
    this.now += SIM_MINUTES_PER_STEP * 60e3;
    this.stepN++;
    const { events } = this.market.step(this.now);
    for (const ev of events) {
      const depth = ASSETS[ev.asset].liqDepthPer1Pct;
      if (ev.notional > depth * 0.25) {
        const sev: Severity = ev.notional > depth * 1.2 ? 'HIGH' : 'MEDIUM';
        this.alert(`LIQ CASCADE ${ev.asset} ${ev.side}S ${fmtCompactUsd(ev.notional)} @ ${fmtNum(ev.price, ASSETS[ev.asset].decimals)} (${ev.impactPct >= 0 ? '+' : ''}${(ev.impactPct * 100).toFixed(2)}%)`, sev);
      }
    }
    if (Math.floor(this.now / MS.HOUR) !== Math.floor(prev / MS.HOUR)) {
      this.market.onHour();
      const eq = this.equityNow();
      if (this.lastHourEquity > 0) this.hourlyRets.push(eq / this.lastHourEquity - 1);
      if (this.hourlyRets.length > 24 * 30) this.hourlyRets.shift();
      this.lastHourEquity = eq;
    }
    if (Math.floor(this.now / MS.DAY) !== Math.floor(prev / MS.DAY)) {
      this.market.onDay();
      const sd = this.surfaces();
      this.dayStartEquity = this.equityNow(sd);
      this.dayHighEquity = this.dayStartEquity;
      for (const st of this.strategies) st.dayPnlAnchor = st.cashFlow + strategyValue(st, sd, this.now);
    }
    this.regimeEngine.update(this.market);
    for (const a of ASSET_LIST) {
      const pr = this.regimeEngine.probs[a];
      const call = argmaxRegime(pr);
      // hysteresis: only announce a shift once the new state leads the old one by a margin
      if (call !== this.lastCall[a] && pr[call] > 0.38 && pr[call] - pr[this.lastCall[a]] > 0.08) {
        this.lastCall[a] = call;
        const p = this.regimeEngine.probs[a][call];
        this.alert(`REGIME SHIFT ${a} → ${call} (${(p * 100).toFixed(0)}%)`, call === 'EXTREME' ? 'HIGH' : 'MEDIUM');
      }
    }

    this.settleExpiries();
    const s = this.surfaces();

    if (this.blowupCountdown > 0) {
      this.blowupCountdown--;
      if (this.blowupCountdown === 0) this.resetAccount();
      this.recordEquity(s);
      return;
    }

    this.checkLiquidation(s);
    this.checkBlowup(s);
    if (this.blowupCountdown > 0) {
      this.recordEquity(s);
      return;
    }
    this.manageExits(s);
    this.refreshMargins(s);
    this.maybeEnter(s);
    this.recordEquity(s);

    const eq = this.equityNow(s);
    this.dayHighEquity = Math.max(this.dayHighEquity, eq);
    if (this.now >= this.circuitUntil && (this.dayHighEquity - eq) / this.dayHighEquity > RISK.circuitDd) {
      this.circuitUntil = this.now + RISK.circuitHours * MS.HOUR;
      this.alert(`CIRCUIT BREAKER TRIPPED — intraday DD ${(((this.dayHighEquity - eq) / this.dayHighEquity) * 100).toFixed(0)}%, new risk halted ${RISK.circuitHours}h`, 'HIGH');
      this.dayHighEquity = eq;
    }
  }

  private recordEquity(s: Surfaces) {
    const eq = this.equityNow(s);
    this.peak = Math.max(this.peak, eq);
    const dd = eq / this.peak - 1;
    if (dd < this.maxDD) {
      this.maxDD = dd;
      this.maxDDUsd = eq - this.peak;
    }
    this.equity.push({ t: this.now, equity: eq, dd });
    if (this.equity.length > 3000) this.equity = this.equity.filter((_, i) => i % 2 === 0 || i > 2800);
  }

  // ------------------------------------------------------------------ snapshot for UI
  snapshot(): DeskSnapshot {
    const now = this.now;
    const s = this.surfaces();
    const { im, mm } = this.refreshMargins(s);
    const equity = this.equityNow(s);
    const expiries = this.market.expiries(now);

    // positions per instrument
    const pos = new Map<string, { qty: number; upnl: number }>();
    for (const st of this.strategies)
      for (const l of st.legs) {
        const sym = instrumentSymbol(l);
        const cur = pos.get(sym) ?? { qty: 0, upnl: 0 };
        cur.qty += l.qty;
        cur.upnl += (theoPrice(s[l.asset], l, now) - l.entryPrice) * l.qty;
        pos.set(sym, cur);
      }

    const chains = {} as Record<Asset, ChainRow[]>;
    const gex = {} as Record<Asset, GexView>;
    const surfaces = {} as Record<Asset, SurfaceView>;
    const assets = {} as Record<Asset, AssetView>;
    for (const a of ASSET_LIST) {
      const rows: ChainRow[] = [];
      const m = this.market.assets[a];
      for (const e of expiries)
        for (const k of this.market.strikes(a, e, now))
          for (const t of ['C', 'P'] as const) {
            const q = this.market.quote({ asset: a, expiry: e, strike: k, type: t }, now);
            const p = pos.get(q.symbol);
            rows.push({ ...q, dte: dteLabel(e, now), position: p?.qty ?? 0, upnl: p?.upnl ?? 0 });
          }
      chains[a] = rows;

      // dealer GEX: dealers assumed long calls (overwriters sell) / short puts (hedgers buy)
      const byStrike = new Map<number, number>();
      let total = 0;
      for (const r of rows) {
        const g = r.gamma * r.oi * m.spot * m.spot * 0.01 * (r.type === 'C' ? 1 : -1);
        total += g;
        byStrike.set(r.strike, (byStrike.get(r.strike) ?? 0) + g);
      }
      const profile = [...byStrike.entries()].sort((x, y) => x[0] - y[0]).map(([strike, g]) => ({ strike, gex: g }));
      const near = rows.filter((r) => r.expiry === expiries[0]);
      const oiByStrike = new Map<number, number>();
      for (const r of near) oiByStrike.set(r.strike, (oiByStrike.get(r.strike) ?? 0) + r.oi);
      const pinning = [...oiByStrike.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]).sort((x, y) => x - y);
      const highestStrike = profile.reduce((b, p) => (Math.abs(p.gex) > Math.abs(b.gex) ? p : b), profile[0]).strike;
      let flip: number | null = null;
      let prevG: number | null = null;
      for (let i = -8; i <= 8; i++) {
        const S2 = m.spot * (1 + i * 0.01);
        let g = 0;
        for (const r of rows) {
          const T = yearsTo(r.expiry, now);
          g += bsGreeks(S2, r.strike, T, RISK_FREE, r.iv, r.type).gamma * r.oi * S2 * S2 * 0.01 * (r.type === 'C' ? 1 : -1);
        }
        if (prevG !== null && Math.sign(g) !== Math.sign(prevG) && flip === null) flip = S2;
        prevG = g;
      }
      gex[a] = { totalAsset: total / m.spot, totalUsd: total, flip, pinning, highestStrike, profile };

      const moneyness = [-0.3, -0.25, -0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
      const days = [1, 3, 7, 14, 21, 30, 45, 60, 90, 120, 160];
      surfaces[a] = { moneyness, days, iv: days.map((d) => moneyness.map((mn) => surfaceIv(s[a], m.spot * (1 + mn), d / 365))) };

      const hist = m.ivHistory;
      const lo = Math.min(...hist, m.atmIv);
      const hi = Math.max(...hist, m.atmIv);
      const cr = this.cascadeRisk(a);
      const longs = m.clusters.filter((c) => c.side === 'LONG').sort((x, y) => y.price - x.price);
      const shorts = m.clusters.filter((c) => c.side === 'SHORT').sort((x, y) => x.price - y.price);
      const dayAgo = m.history[Math.max(0, m.history.length - 1 - STEPS_PER_HOUR * 24)];
      assets[a] = {
        asset: a,
        spot: m.spot,
        change24h: m.spot / dayAgo - 1,
        atmIv: m.atmIv,
        longIv: m.longIv,
        realizedVol: m.realizedVol,
        ivRank: hi > lo ? (m.atmIv - lo) / (hi - lo) : 0.5,
        ivPercentile: hist.filter((v) => v <= m.atmIv).length / Math.max(1, hist.length),
        skew: m.skew,
        funding: m.funding,
        perpOi: m.perpOi,
        liq1hLong: m.liq1hLong,
        liq1hShort: m.liq1hShort,
        clusters: m.clusters.map((c) => ({ ...c })),
        cascadeRiskDown: cr.down,
        cascadeRiskUp: cr.up,
        nearestLong: longs[0] ?? null,
        nearestShort: shorts[0] ?? null,
        spark: m.history.slice(-180),
      };
    }

    // strategies + greeks
    const byAsset = {} as Record<Asset, GreekTotals>;
    for (const a of ASSET_LIST) byAsset[a] = { delta: 0, deltaUsd: 0, gammaUsd: 0, vega: 0, theta: 0, rho: 0 };
    const views: StrategyView[] = this.strategies.map((st) => {
      const g = strategyGreeks(st, s, now);
      const ba = byAsset[st.asset];
      ba.delta += g.delta;
      ba.deltaUsd += g.deltaUsd;
      ba.gammaUsd += g.gammaUsd;
      ba.vega += g.vega;
      ba.theta += g.theta;
      ba.rho += g.rho;
      const pnl = st.cashFlow + strategyValue(st, s, now);
      const rule = STRATEGY_RULES[st.kind];
      return {
        id: st.id,
        kind: st.kind,
        asset: st.asset,
        label: st.label,
        tag: st.tag,
        legs: st.legs.length,
        units: st.units,
        size: st.units * ASSETS[st.asset].minQty,
        pnl,
        pnlPct: st.riskCapital > 0 ? pnl / st.riskCapital : 0,
        dayPnl: pnl - st.dayPnlAnchor,
        theta: g.theta,
        vega: g.vega,
        delta: g.delta,
        im: this.imCache.get(st.id) ?? 0,
        riskCapital: st.riskCapital,
        ageHours: (now - st.openedAt) / MS.HOUR,
        tp: rule.tp * st.riskCapital,
        sl: -rule.sl * st.riskCapital,
        note: st.entryNote,
      };
    });
    const tot: GreekTotals = { delta: 0, deltaUsd: 0, gammaUsd: 0, vega: 0, theta: 0, rho: 0 };
    for (const a of ASSET_LIST) {
      const g = byAsset[a];
      tot.deltaUsd += g.deltaUsd;
      tot.gammaUsd += g.gammaUsd;
      tot.vega += g.vega;
      tot.theta += g.theta;
      tot.rho += g.rho;
    }
    tot.delta = tot.deltaUsd / s.BTC.spot;
    let vegaNotional = 0;
    for (const st of this.strategies)
      for (const l of st.legs) {
        const lg = legGreeks(l, s, now);
        vegaNotional += Math.abs(lg.vega * l.qty) * 100;
      }

    // scenario grid: BTC-led spot move (beta-scaled) × absolute IV shift
    const spotMoves = [-0.1, -0.05, 0, 0.05, 0.1];
    const ivShifts = [-0.1, -0.05, 0, 0.05, 0.1];
    const v0 = portfolioValue(this.strategies, s, now);
    const grid = ivShifts.map((iv) => spotMoves.map((mv) => portfolioValue(this.strategies, shockSurfaces(s, mv, iv), now) - v0));

    // risk
    const mc = monteCarloVar(this.strategies, this.market, now, this.riskRng, 300);
    const stressS = shockSurfaces(s, -0.15, 0.25);
    const imStress = this.strategies.reduce((acc, st) => acc + initialMargin(st, stressS, now), 0);
    let car = 0;
    for (const mv of [-0.2, -0.1, 0, 0.1, 0.2])
      for (const iv of [-0.15, 0, 0.15]) car = Math.min(car, portfolioValue(this.strategies, shockSurfaces(s, mv, iv), now) - v0);
    let liqDown: number | null = null;
    let liqUp: number | null = null;
    if (mm > 0) {
      for (let i = 1; i <= 80 && (liqDown === null || liqUp === null); i++) {
        const mv = i * 0.005;
        if (liqDown === null && this.cash + portfolioValue(this.strategies, shockSurfaces(s, -mv, mv * 1.2), now) < mm) liqDown = -mv;
        if (liqUp === null && this.cash + portfolioValue(this.strategies, shockSurfaces(s, mv, 0), now) < mm) liqUp = mv;
      }
    }

    const alloc = new Map<StrategyKind, { margin: number; vega: number; count: number }>();
    for (const v of views) {
      const cur = alloc.get(v.kind) ?? { margin: 0, vega: 0, count: 0 };
      cur.margin += Math.max(v.im, v.riskCapital * (v.im > 0 ? 0 : 1));
      cur.vega += v.vega;
      cur.count++;
      alloc.set(v.kind, cur);
    }

    const rets = this.hourlyRets;
    let sharpe: number | null = null;
    if (rets.length >= 24) {
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
      sharpe = sd > 0 ? (mean / sd) * Math.sqrt(24 * 365) : null;
    }
    const ex = this.execStats;
    const call = {} as Record<Asset, Regime>;
    const probs = {} as Record<Asset, RegimeProbs>;
    for (const a of ASSET_LIST) {
      call[a] = argmaxRegime(this.regimeEngine.probs[a]);
      probs[a] = { ...this.regimeEngine.probs[a] };
    }

    return {
      now,
      stepN: this.stepN,
      attempt: this.attempt,
      blowups: this.blowups,
      blowup: { active: this.blowupCountdown > 0, secondsLeft: this.blowupCountdown, lastPeak: this.attemptsLog[0]?.peak ?? 0 },
      attemptsLog: this.attemptsLog.map((x) => ({ ...x })),
      kindStats: Object.entries(this.kindStats).map(([kind, v]) => ({ kind: kind as StrategyKind, ...v! })),
      account: {
        equity,
        cash: this.cash,
        start: START_CAPITAL,
        dayPnl: equity - this.dayStartEquity,
        dayPnlPct: this.dayStartEquity > 0 ? equity / this.dayStartEquity - 1 : 0,
        totalPnl: equity - START_CAPITAL,
        totalReturn: equity / START_CAPITAL - 1,
        sharpe,
        maxDD: this.maxDD,
        maxDDUsd: this.maxDDUsd,
        peak: this.peak,
        realized: this.stats.realized,
        fees: this.stats.fees,
        im,
        mm,
        marginUtil: equity > 0 ? im / equity : im > 0 ? 9.99 : 0,
        marginRatio: equity > 0 ? mm / equity : mm > 0 ? 9.99 : 0,
        available: equity - im,
        liqCount: this.stats.liqCount,
        trades: this.stats.trades,
        wins: this.stats.wins,
        losses: this.stats.losses,
      },
      regime: { probs, call, hidden: this.market.regime, confidence: this.regimeEngine.confidence() },
      assets,
      chains,
      expiries,
      surfaces,
      gex,
      strategies: views,
      greeks: { ...tot, deltaBtc: tot.delta, vegaNotional },
      greeksByAsset: byAsset,
      scenario: { spotMoves, ivShifts, grid },
      risk: { var95: mc.var95, es95: mc.es95, im, imStress, imIncrease: imStress - im, capitalAtRisk: -car, liqDown, liqUp },
      allocation: [...alloc.entries()].map(([kind, v]) => ({ kind, ...v })),
      exec: {
        avgSlipBp: ex.fills ? ex.slippageBpSum / ex.fills : 0,
        fillRate: ex.attempts ? ex.fills / ex.attempts : 1,
        avgLatency: ex.attempts ? ex.latencySum / ex.attempts : 0,
        rejectRate: ex.attempts ? ex.rejects / ex.attempts : 0,
        fees: ex.feeSum,
        lastLatency: ex.latencyLast,
        fills: ex.fills,
      },
      system: { circuit: now < this.circuitUntil ? 'TRIPPED' : 'ARMED', circuitMinutesLeft: Math.max(0, (this.circuitUntil - now) / 60e3), latencyGuardMs: 250, feedLagMs: ex.latencyLast },
      equity: this.equity,
      liqMarks: this.liqMarks,
      fills: this.fills.slice(0, 60),
      alerts: this.alerts.slice(0, 40),
      marketLiqs: this.market.liqEvents.slice(-40).reverse(),
      accountLiqs: this.accountLiqs,
    };
  }
}

export { STRATEGY_NAMES };
