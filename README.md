# Nexus Quant Options Desk

Hebrew (RTL) React + TypeScript + Tailwind v4 + Vite options desk.

## Binance options bot (`npm run bot`) — the main product

A 24/7 Node service that trades Binance European Options with a **fixed portfolio** (default 2,500 USDT, never topped up) and serves
the dashboard at http://localhost:8787 (tab "בוט Binance").

- **Real Binance data:** contracts, lot/tick sizes and per-contract fee rates from `/eapi/v1/exchangeInfo`, bid/ask from `/ticker`,
  Binance's own mark price, IV and Greeks from `/mark`, index from `/index`, 1m spot klines for realised vol / momentum,
  the USDⓈ-M liquidation stream, and **official settlement prices** from `/exerciseHistory`.
- **Execution like a real account:** every order is an IOC limit (best price ± 3%). Paper mode fetches the live order book and walks
  its levels (partial fills, lot step, tick rounding); live mode sends the same order to `POST /eapi/v1/order`.
- **Binance's rules:** buy-only (a regular Binance account cannot write options), fee = min(rate × index × unit, 10% × price) × size,
  exercise fee at settlement; positions held to expiry settle at Binance's published settlement price.
- **Strategies:** long straddle when realised vol runs above Binance's ATM IV (or on liquidation bursts); long 0.35-delta call/put on
  confirmed multi-horizon momentum. Exits: take-profit, stop-loss, trailing stop, time stop, close before expiry.
- **Risk:** max premium per trade and open, max positions, daily loss stop, max-drawdown halt (manual resume), spread/liquidity filters.
- **Operations:** state saved atomically every cycle (restart-safe), every fill appended to `bot-trades.csv`, API weight tracked with back-off on 429/418.
- **Live trading** requires `BOT_MODE=live`, API keys with Options permission, and `LIVE_CONFIRM=I_ACCEPT_REAL_MONEY_RISK`; it checks the
  options wallet holds at least `BOT_CAPITAL`. Not yet exercised against the real exchange — start with a very small `BOT_CAPITAL`.

```sh
cp .env.example .env    # adjust, then export the variables (or set them in your process manager)
npm ci && npm run build
npm run bot             # dashboard + API: http://localhost:8787
npm run test:bot        # offline end-to-end test: HMAC vs Binance's example, fees vs Binance's FAQ, book walk, settlement, cash reconciliation
```

Binance blocks US IP addresses; run the bot from a supported region. Keep `BOT_HOST=127.0.0.1` — the control endpoint must not be public.

## Strategy lab

The second tab ("מעבדת אסטרטגיות") is a research lab with these surfaces (no real orders):

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
