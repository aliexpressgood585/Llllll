import type { TradingBot } from './bot';
import { CONFIG } from './config';
import type { OptionsMarket } from './market';
import { buildReport } from './report';

/** JSON view served to the dashboard at /api/state */
export function buildSnapshot(bot: TradingBot, market: OptionsMarket, liqConnected: boolean) {
  const s = bot.state;
  const eq = bot.equity();
  const now = Date.now();
  const closed = s.closed;
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = -losses.reduce((a, t) => a + t.pnl, 0);
  // daily returns from the equity curve for Sharpe
  const byDay = new Map<number, number>();
  for (const p of s.equity) byDay.set(Math.floor(p.t / 86400e3), p.equity);
  const daily = [...byDay.values()];
  const rets = daily.slice(1).map((v, i) => v / daily[i] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  let peak = s.capital;
  let maxDD = 0;
  for (const p of s.equity) {
    peak = Math.max(peak, p.equity);
    maxDD = Math.max(maxDD, 1 - p.equity / peak);
  }
  const openCost = s.positions.reduce((a, p) => a + p.cost, 0);

  return {
    time: now,
    mode: CONFIG.mode,
    report: buildReport(s, eq.bid),
    status: {
      dataAgeMs: now - market.lastQuotes,
      contracts: market.contracts.size,
      quotes: market.quotes.size,
      weightUsed: market.api.weightUsed,
      liqStream: liqConnected,
      halted: s.halted,
      haltReason: s.haltReason,
      entriesPausedUntil: s.entriesPausedUntil,
      errors: market.errors.slice(0, 10),
    },
    portfolio: {
      capital: s.capital,
      cash: s.cash,
      equityBid: eq.bid,
      equityMark: eq.mark,
      pnl: eq.bid - s.capital,
      pnlPct: eq.bid / s.capital - 1,
      dayPnl: eq.bid - s.dayStart.equity,
      openPremium: openCost,
      openPremiumPct: openCost / Math.max(1, eq.bid),
      feesPaid: s.feesPaid,
      peak: s.peakEquity,
      drawdown: 1 - eq.bid / Math.max(1, s.peakEquity),
      maxDD,
      trades: closed.length,
      winRate: closed.length ? wins.length / closed.length : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? -grossLoss / losses.length : 0,
      sharpe: rets.length >= 5 && sd > 0 ? (mean / sd) * Math.sqrt(365) : null,
      startedAt: s.startedAt,
    },
    risk: CONFIG.risk,
    exits: CONFIG.exits,
    positions: s.positions.map((p) => {
      const v = bot.positionValue(p);
      return {
        ...p,
        valueBid: v.bid,
        valueMark: v.mark,
        pnl: v.bid - p.cost + (p.proceeds ?? 0),
        pnlPct: p.cost > 0 ? (v.bid + (p.proceeds ?? 0) - p.cost) / p.cost : 0,
        legs: p.legs.map((l) => {
          const c = market.contracts.get(l.symbol);
          const q = market.quotes.get(l.symbol);
          return { ...l, expiry: c?.expiry ?? 0, strike: c?.strike ?? 0, side: c?.side ?? 'CALL', bid: q?.bid ?? 0, ask: q?.ask ?? 0, mark: q?.mark ?? 0, iv: q?.markIV ?? 0, delta: q?.delta ?? 0, theta: q?.theta ?? 0, vega: q?.vega ?? 0 };
        }),
      };
    }),
    closed: closed.slice(0, 100),
    fills: s.fills.slice(0, 100),
    equity: s.equity.length > 1500 ? s.equity.filter((_, i) => i % Math.ceil(s.equity.length / 1500) === 0 || i === s.equity.length - 1) : s.equity,
    signals: s.signals.slice(0, 30),
    events: s.events.slice(0, 60),
    market: market.underlyings.map((u) => {
      const exps = market.expiries(u);
      const e3 = exps.find((e) => e - now > 30 * 3600e3) ?? exps[0];
      const idx = market.index[u];
      return {
        underlying: u,
        index: idx?.price ?? 0,
        dayChange: idx ? idx.price / idx.dayOpen - 1 : 0,
        rv1h: market.realizedVol(u, 60),
        rv16h: market.realizedVol(u, 960),
        atmIv: e3 ? market.atmIv(u, e3) : 0,
        atmExpiry: e3 ?? 0,
        z1h: market.momentumZ(u, 60),
        z4h: market.momentumZ(u, 240),
        liq15mLong: market.liqSum(u, 15, 'LONG'),
        liq15mShort: market.liqSum(u, 15, 'SHORT'),
        liq1h: market.liqSum(u, 60),
        expiries: exps.length,
        spark: (market.closes[u] ?? []).slice(-240).filter((_, i) => i % 2 === 0).map((x) => x.c),
      };
    }),
  };
}

export type BotSnapshot = ReturnType<typeof buildSnapshot>;
