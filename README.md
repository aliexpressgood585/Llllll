# Nexus Quant Options Desk — high-aggression crypto options desk (simulation)

React + TypeScript + Tailwind v4 + Vite. Fully client-side, deterministic-per-seed simulation. **Not connected to real money.**

## Run

```bash
npm ci
npm run dev          # http://localhost:5173
npm run build        # typecheck + production build -> dist/
npm run preview      # serve dist/ on http://localhost:4173
npm run sim:soak -- 12 42   # headless: 12 sim-days, seed 42 (engine calibration)
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
  adapters/          live-API contracts (MarketDataFeed, LiveExecutionVenue) + Binance public feed
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
