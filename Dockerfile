# Binance options bot + dashboard. State and trade journal live in /data (mount a volume).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV BOT_HOST=0.0.0.0 \
    BOT_PORT=8787 \
    BOT_STATE_FILE=/data/bot-state.json \
    BOT_JOURNAL_FILE=/data/bot-trades.csv
VOLUME /data
EXPOSE 8787
CMD ["npx", "tsx", "bot/index.ts"]
