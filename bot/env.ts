import { existsSync } from 'node:fs';

/** Side-effect module: load .env before any config is read. Must be the first import of every bot entry point. */
if (existsSync('.env')) process.loadEnvFile('.env');
