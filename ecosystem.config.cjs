// pm2 start ecosystem.config.cjs   (npm i -g pm2)  — keeps the bot running and restarts it after crashes/reboots (pm2 save && pm2 startup)
module.exports = {
  apps: [
    {
      name: 'nexus-options-bot',
      script: 'node_modules/.bin/tsx',
      args: 'bot/index.ts',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 10000,
      env: { BOT_MODE: 'paper', BOT_CAPITAL: '2500' },
    },
  ],
};
