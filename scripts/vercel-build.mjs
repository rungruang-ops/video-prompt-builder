#!/usr/bin/env node
// Vercel build: compile the API (for api/index.mjs) + build the SPA; optionally run DB migrations.
// Migrations run only when MIGRATE_ON_BUILD=true AND this is a production deployment (VERCEL_ENV=production),
// so preview deployments never migrate the production database. Otherwise run `npm run migrate` yourself.
import { execSync } from 'node:child_process';
const run = cmd => { console.log(`[vercel-build] $ ${cmd}`); execSync(cmd, { stdio: 'inherit' }); };

run('npm run build');
const want = /^(1|true|yes)$/i.test(process.env.MIGRATE_ON_BUILD || '');
const env = process.env.VERCEL_ENV || 'local';
if (want && (env === 'production' || /^(1|true|yes)$/i.test(process.env.MIGRATE_ON_PREVIEW || ''))) {
  // migrations take a session-level advisory lock → prefer the direct (unpooled) connection when available (Neon sets DATABASE_URL_UNPOOLED)
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) { console.error('[vercel-build] MIGRATE_ON_BUILD=true but DATABASE_URL is not set'); process.exit(1); }
  console.log('[vercel-build] $ npm run migrate:dist -w apps/api');
  execSync('npm run migrate:dist -w apps/api', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url, DATABASE_SSL: process.env.DATABASE_SSL || 'true' } });
} else {
  console.log(`[vercel-build] skipping migrations (MIGRATE_ON_BUILD=${process.env.MIGRATE_ON_BUILD || 'unset'}, VERCEL_ENV=${env}) — run \`npm run migrate\` against DATABASE_URL`);
}
