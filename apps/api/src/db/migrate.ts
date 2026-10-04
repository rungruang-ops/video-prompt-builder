import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Db } from './pool.js';

// Works from src/db (tsx) and dist/db (compiled): migrations live in apps/api/migrations
export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

/** Minimal forward-only migrator: each *.sql file runs once, in order, inside a transaction, under an advisory lock. */
export async function migrate(db: Db, log: (m: string) => void = () => {}): Promise<string[]> {
  const client = await db.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, f), 'utf8');
      await client.query('BEGIN');
      try { await client.query(sql); await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]); await client.query('COMMIT'); }
      catch (e) { await client.query('ROLLBACK'); throw new Error(`migration ${f} failed: ${(e as Error).message}`); }
      applied.push(f); log(`migration applied: ${f}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    client.release();
  }
  return applied;
}
