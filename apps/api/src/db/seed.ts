import { PRESETS } from '@vpb/core';
import type { Db } from './pool.js';
import type { Config } from '../config.js';
import { hashPassword } from '../lib/password.js';

/** Idempotent: upserts the built-in system presets from @vpb/core. */
export async function seedSystemPresets(db: Db): Promise<number> {
  let i = 0;
  for (const p of PRESETS) {
    await db.query(
      `INSERT INTO presets (slug, user_id, is_system, name_th, emoji, target_model, spec, sort_order)
       VALUES ($1, NULL, true, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) WHERE is_system DO UPDATE SET name_th = EXCLUDED.name_th, emoji = EXCLUDED.emoji,
         target_model = EXCLUDED.target_model, spec = EXCLUDED.spec, sort_order = EXCLUDED.sort_order`,
      [p.id, p.th, p.e, p.model, JSON.stringify(p.s), i++]);
  }
  return i;
}
/** Creates the admin from ADMIN_EMAIL/ADMIN_PASSWORD if that email does not exist yet. */
export async function seedAdmin(db: Db, cfg: Config, log: (m: string) => void = () => {}): Promise<void> {
  if (!cfg.ADMIN_EMAIL || !cfg.ADMIN_PASSWORD) return;
  if (cfg.ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  const ex = await db.query('SELECT id FROM users WHERE lower(email) = lower($1)', [cfg.ADMIN_EMAIL]);
  if (ex.rowCount) return;
  await db.query(`INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, 'Admin', 'admin')`, [cfg.ADMIN_EMAIL.toLowerCase(), await hashPassword(cfg.ADMIN_PASSWORD)]);
  log(`seeded admin user ${cfg.ADMIN_EMAIL}`);
}
