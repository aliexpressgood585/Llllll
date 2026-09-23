# Nexus Quant Options Desk — high-aggression crypto options desk

React + TypeScript + Tailwind v4 + Vite. Hebrew RTL dashboard. Two data modes (switch in the header, or `#live` / `#sim` in the URL):

- **Live (default)** — real public market data, **paper trading only** (no order ever reaches an exchange):
  - Deribit (WebSocket JSON-RPC, no keys): option chains for BTC, ETH, SOL_USDC (bid/ask/mark/IV/OI/volume), index prices,
    perp funding + open interest, 24h price history, 30d DVOL history. Greeks are Black-76 on each expiry's forward.
  - Binance USDⓈ-M public liquidation stream (`!forceOrder@arr`) — real liquidations (Binance throttles to 1/sec/symbol, so totals are a lower bound).
  - The leverage/liquidation-level map is an **estimate** built from price history and OI, like public liquidation heatmaps.
  - The paper book persists in the browser (localStorage) across reloads.
  - If Deribit can't be reached in 25s the app falls back to simulation and says so.
- **Simulation** — synthetic regime-switching market with liquidation cascades; speed controls 1x–30x.

**Not connected to real money.**

## Run

```bash
npm ci
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build -> dist/
npm run preview      # serve dist/ on http://localhost:4173
npm run sim:soak -- 12 42   # headless: 12 sim-days, seed 42 (engine calibration)
npm run test:live           # offline test of the live pipeline against a mock Deribit (documented response formats)
npm run paper               # 24/7 headless paper trading on live data (Node >= 22); state in paper-state.json
```

## Deploy (Vercel)

```bash
npm i -g vercel
vercel login
vercel link          # first time only
vercel --prod        # uses vercel.json: npm ci -> npm run build -> dist/
```

Or import the Git repo in the Vercel dashboard (framework preset: Vite, no env vars required).
Optional: `VITE_DATA_SOURCE=binance-public` anchors simulated prices to live Binance index prices (read-only, no keys).

## Structure

```
src/
  engine/            pure TS simulation (no React)
    config.ts        capital ($2,500), aggression knobs, fee schedule, regime params
    market.ts        regime-switching jump diffusion, perp leverage clusters + liquidation cascades, IV surface, quotes
    execution.ts     smart router Binance/Deribit: book-walk slippage, latency drift, rejects, liquidation crossing
    fees.ts          Binance/Deribit taker/maker, premium caps, exercise & liquidation fees
    valuation.ts     Black-Scholes revaluation, risk-based IM/MM, Monte-Carlo VaR/ES
    regime.ts        observable-feature regime classifier (bull/neutral/bear/extreme)
    strategies.ts    IC, short strangle, calendar, risk reversal, directional, long straddle
    engine.ts        orchestration: entries/exits, expiry settlement, forced liquidation, blowup & re-fund, snapshot
  live/              Deribit WS client, LiveMarket (MarketSource impl), Binance liquidation stream, paper-book persistence
  adapters/          contracts for a future real-order execution venue (LiveExecutionVenue)
  hooks/             useDesk (engine clock), useElementSize
  components/        dashboard panels
scripts/headless.ts  soak test / calibration
```

## Model notes

- Account starts at $2,500; positions sized at up to 45% of equity per trade and up to 98% margin use.
- Maintenance margin = 85% of risk-based IM → forced liquidation closes the largest margin users with a 0.35% clearance fee plus aggressive crossing.
  Equity below 10% of start = wipe-out; the desk re-funds $2,500 after a cooldown and logs the dead account.
- Market-wide liquidation clusters (10–100x leverage) sit around spot; crossing them triggers forced flow that moves price and can cascade.
- Fees: 0.03% of index notional, capped at 10% (Binance) / 12.5% (Deribit) of premium; exercise fee 0.015%.

## Towards real trading (not implemented yet)

Real orders need a small backend holding API keys (never in the browser), exchange-exact margin checks, and the
`LiveExecutionVenue` contract in `src/adapters/types.ts` implemented for Deribit (`private/buy`, `private/sell`) — start on
test.deribit.com. Only consider it after weeks of paper results with a positive edge after fees.
