import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const cfg = loadConfig();
const app = await buildApp(cfg);
const shutdown = async (sig: string) => { app.log.info(`${sig} received, shutting down`); await app.close(); process.exit(0); };
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
await app.listen({ host: cfg.HOST, port: cfg.PORT });
