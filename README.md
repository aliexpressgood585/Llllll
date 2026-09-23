# Nexus Quant Options Desk

Hebrew (RTL) React + TypeScript + Tailwind v4 + Vite options desk. **No real orders are ever sent.** Three clearly separated surfaces:

- **Live paper trading (default, `#live`)** — the strategy engine runs in wall-clock time on real public market data and fills on paper against real bid/ask:
  - Deribit public WebSocket JSON-RPC (no keys): option chains for BTC, ETH, SOL_USDC (bid/ask/mark/IV/OI/volume), index prices,
    perp funding + open interest, 24h price history, 30d DVOL. Greeks are Black-76 on each expiry's forward; the risk surface interpolates market IVs.
  - Binance USDⓈ-M public liquidation stream (`!forceOrder@arr`). Binance throttles it to one event/sec/symbol, so totals are a lower bound.
  - The leverage/liquidation-level map is an **estimate** from price history and OI (like public liquidation heatmaps), not exchange data.
  - The paper book persists in the browser (localStorage). If Deribit is unreachable within 25s the app falls back to the simulation and says so.
  - Paper fills assume ~25 lots at the touch (the summary feed has no depth) and Deribit's fee schedule.
- **Binance public market monitor** — read-only: lists Binance options via exchangeInfo, refreshes index and depth every 10s,
  validates lot sizes and estimates a marketable limit buy by walking the ask book. Fees are editable assumptions.
- **Synthetic laboratory (`#sim`)** — generated market, IV, liquidation clusters and the same strategy engine. Not a historical backtest. Starts paused.

## Run and verify

```sh
npm ci
npm run dev                                   # http://localhost:5173 (#live or #sim)
npm run build                                 # typecheck + production build -> dist/
node --import tsx --test scripts/realism.test.ts
npm run test:live                             # offline test of the live pipeline against a mock Deribit (documented formats)
npm run sim:soak -- 12 42                     # headless: 12 sim-days, seed 42
npm run paper                                 # 24/7 headless paper trading on live data (Node >= 22); state in paper-state.json
```

## Risk settings and realism corrections

Per-trade budget 10% of equity, margin utilisation limit 60%, intraday drawdown circuit breaker at 5% with a three-hour entry pause.
These do not guarantee a loss cap. Closing legs use the position venue's quote; routing includes fees; tick rounding is adverse;
invalid quantities and expired requests are rejected. Wiped accounts stop, keep negative balances, and never refill automatically — reset is explicit.
Speed labels in the simulation show the real sim/wall-clock ratio (240x at the lowest setting).

## Deployment

Vercel Vite preset (`vercel.json`): `npm ci`, `npm run build`, output `dist`. Public exchange access can be unavailable because of regional
restrictions or network policy; the UI then shows it explicitly. Live mode cannot run inside a claude.ai artifact (its sandbox blocks outside connections).

## Structure

```
src/
  engine/        strategy engine (pure TS): market model, execution, fees, margin/VaR, regime classifier, strategies
    marketSource.ts   interface implemented by MarketSim (synthetic) and LiveMarket (real data)
  live/          Deribit WS client, LiveMarket, Binance liquidation stream, Binance options REST, paper-book persistence
  adapters/      contract for a future real-order venue (LiveExecutionVenue)
  hooks/ components/   UI
scripts/         realism tests, live pipeline fixture test, soak test, 24/7 paper runner
```

## Limits and next steps

No historical validation yet, no verified account commission, settlement uses the index at expiry (Deribit uses a 30-minute average),
margin is a risk-based approximation, not the exchange formula. Real orders would need a backend holding API keys (never in the browser),
exchange-exact margin checks and `LiveExecutionVenue` implemented for Deribit (`private/buy` / `private/sell`), starting on test.deribit.com —
and only after weeks of paper results showing a positive edge after fees.

API references: https://docs.deribit.com/ · https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data
