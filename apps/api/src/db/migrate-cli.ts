import { loadConfig } from '../config.js';
import { createPool, type SslMode } from './pool.js';
import { migrate } from './migrate.js';
import { seedAdmin, seedSystemPresets } from './seed.js';

// Run with: npm run migrate (dev, tsx)  ·  npm run migrate:dist -w apps/api (compiled; Vercel build / CI / containers)
const cfg = loadConfig(process.env, {}, { requireSecrets: false });
if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set — using the local default ' + cfg.DATABASE_URL.replace(/:[^:@/]*@/, ':***@'));
const db = createPool(cfg.DATABASE_URL, { ssl: cfg.DATABASE_SSL as SslMode, max: 1 });
try {
  const applied = await migrate(db, console.log);
  const n = await seedSystemPresets(db);
  await seedAdmin(db, cfg, console.log);
  console.log(`migrations: ${applied.length ? applied.join(', ') : 'up to date'} · system presets: ${n}`);
} finally { await db.end(); }
