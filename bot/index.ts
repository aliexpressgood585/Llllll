/**
 * Binance options bot — entry point.  `npm run bot`
 * Paper mode (default) trades against Binance's real order books with Binance's fee and settlement rules.
 */
import './env';
import { BinanceLiquidationStream } from '../src/live/binanceLiquidations';
import { BinanceClient } from './binanceClient';
import { LiveBroker, PaperBroker, type Broker } from './broker';
import { TradingBot } from './bot';
import { CONFIG } from './config';
import { OptionsMarket } from './market';
import { startServer } from './server';
import { buildSnapshot } from './snapshot';

const api = new BinanceClient(CONFIG.eapiBase, CONFIG.spotBase, CONFIG.apiKey, CONFIG.apiSecret);
const market = new OptionsMarket(api, CONFIG.underlyings);

async function main() {
  console.log(`Binance options bot · mode=${CONFIG.mode} · capital=${CONFIG.capital} USDT · underlyings=${CONFIG.underlyings.join(',')}`);
  try {
    await api.syncTime();
    await market.loadInfo();
    await market.refreshQuotes();
    await market.refreshHistory();
  } catch (e) {
    console.error(`Cannot load Binance options market data: ${e instanceof Error ? e.message : e}`);
    console.error('Binance blocks some regions (e.g. US IPs return 451). Run the bot from a machine/VPS in a supported region.');
    process.exit(1);
  }
  let broker: Broker = new PaperBroker(market);
  if (CONFIG.mode === 'live') {
    broker = new LiveBroker(api, market);
    const acct = await api.account();
    const usdt = acct.asset.find((a) => a.asset === 'USDT');
    console.log(`LIVE account USDT equity=${usdt?.equity} available=${usdt?.available}`);
    if (!usdt || Number(usdt.available) < CONFIG.capital) throw new Error(`options wallet available ${usdt?.available ?? 0} < BOT_CAPITAL ${CONFIG.capital}`);
  }
  console.log(`${market.contracts.size} contracts on ${market.underlyings.join(', ')}`);

  const liqs = new BinanceLiquidationStream((l) => market.onLiquidation({ time: l.time, underlying: `${l.asset}USDT`, side: l.side, notional: l.notional }), CONFIG.liqStream);
  liqs.start();
  const bot = new TradingBot(market, broker);

  startServer(CONFIG.port, CONFIG.host, () => buildSnapshot(bot, market, liqs.connected), (a) => bot.control(a));

  await bot.tick();
  setInterval(() => void bot.tick(), CONFIG.pollMs);
  setInterval(() => market.loadInfo().catch((e) => market.noteError(`exchangeInfo: ${e}`)), 30 * 60e3);
  setInterval(() => market.refreshHistory().catch((e) => market.noteError(`klines: ${e}`)), 2 * 60e3);

  const stop = () => {
    bot.save();
    liqs.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
