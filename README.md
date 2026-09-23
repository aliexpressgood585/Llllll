# Nexus Quant Options Desk

Hebrew React + TypeScript dashboard with two explicitly separate surfaces:

- **Binance public market monitor:** discovers listed options through exchangeInfo, refreshes index and depth every 10 seconds, validates lot sizes, rejects stale/expired/illiquid estimates, and estimates a marketable limit buy by walking ask levels. Fees are editable assumptions, not verified account rates. Read-only; no account connection or order submission. Quantity follows API depth base-asset units.
- **Synthetic laboratory:** the existing generated market, IV, liquidation clusters and strategy engine. This is NOT a Binance historical backtest or a live trading engine. Starts paused. Venue badges say model only. Synthetic margin and fees remain approximations.

## Run and verify

```sh
npm ci
npm run build
node --import tsx --test scripts/realism.test.ts
npm run dev
```

## Realism corrections

Closing executions use the position venue's quote. Routing includes modeled fees; tick rounding is adverse. Invalid quantities and expired requests are rejected. Circuit breaker is evaluated before new entries. Per-trade budget is 10%, margin utilization limit 60%, intraday drawdown trigger 5% with a three-hour entry pause. These settings do not guarantee a loss cap. Warm-up ends at the requested start time. Wiped accounts stop, preserve negative balances, and never automatically refill. Reset is explicit. Speed labels show actual simulated/wall-clock ratio (240x at the lowest setting).

The optional legacy index anchor is no longer wired to the simulation: blending a live index into a random market is not live trading. Failures in the public monitor are visible and never replaced with synthetic quotes.

## Deployment

Vercel Vite preset, `npm ci`, `npm run build`, output `dist`. Deploy the `claude/crypto-options-trading-desk-m8mnmf` branch; repository default branch contains a separate rooms project. Public Binance access can be unavailable due to regional restrictions or browser CORS. In that case the monitor explicitly shows unavailable and blocks estimates.

## Limits

No actual trades, historical validation, real account P&L, verified account commission, settlement or liquidation replication. Order-book snapshots cannot guarantee fills or model future latency. Strategy risk, Greeks, GEX and all simulation P&L remain synthetic. Automated deployment requires an authorized Vercel account.

API reference: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data
