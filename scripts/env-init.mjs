#!/usr/bin/env node
// Create .env from .env.example with fresh random secrets (JWT_SECRET, ENCRYPTION_KEY, POSTGRES_PASSWORD, REDIS_PASSWORD).
// Usage: node scripts/env-init.mjs [--force] [--out .env]
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '.env';
export function fillSecrets(text) {
  // passwords are base64url: safe inside postgres:// and redis:// URLs without escaping
  const gen = { JWT_SECRET: randomBytes(48).toString('base64'), ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    POSTGRES_PASSWORD: randomBytes(24).toString('base64url'), REDIS_PASSWORD: randomBytes(24).toString('base64url') };
  let s = text;
  for (const [k, v] of Object.entries(gen)) s = s.replace(new RegExp(`^${k}=CHANGE-ME\\s*$`, 'm'), `${k}=${v}`);
  return s;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  if (existsSync(out) && !args.includes('--force')) { console.error(`${out} already exists (use --force to overwrite)`); process.exit(1); }
  writeFileSync(out, fillSecrets(readFileSync('.env.example', 'utf8')), { mode: 0o600 }); chmodSync(out, 0o600);
  console.log(`created ${out} with random JWT_SECRET, ENCRYPTION_KEY, POSTGRES_PASSWORD and REDIS_PASSWORD (file mode 600)`);
}
