import type { Db } from '../db/pool.js';

/**
 * Invalidate every session (JWT) of a user by bumping users.token_version.
 * Tokens carry the version they were issued with ("tv"); authenticate() rejects mismatches.
 * Returns the new version (to re-issue a cookie for the current device) or null if the user does not exist.
 */
export async function revokeSessions(db: Pick<Db, 'query'>, userId: string): Promise<number | null> {
  const r = await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version', [userId]);
  return r.rowCount ? Number(r.rows[0].token_version) : null;
}

/** A token is current when its "tv" claim equals the stored version (tokens issued before this feature count as 0). */
export const tokenIsCurrent = (claim: unknown, stored: unknown) => Number(claim ?? 0) === Number(stored ?? 0);
