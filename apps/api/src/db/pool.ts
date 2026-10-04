import pg from 'pg';
export type Db = pg.Pool;
export type SslMode = 'false' | 'true' | 'no-verify';
export interface PoolOptions { ssl?: SslMode | boolean; max?: number }

/**
 * PostgreSQL pool. Serverless (Vercel): keep `max` small (DB_POOL_MAX=1..3) and use the provider's pooled
 * connection string (Neon "-pooler" host / Supabase pgbouncer) so many function instances don't exhaust connections.
 */
export function createPool(url: string, o: PoolOptions | SslMode | boolean = {}): Db {
  const opts: PoolOptions = typeof o === 'object' ? o : { ssl: o };
  const mode = opts.ssl === true ? 'true' : opts.ssl === false || opts.ssl === undefined ? 'false' : opts.ssl;
  const max = Math.max(1, opts.max ?? 10);
  // TLS verifies the server certificate by default; "no-verify" only for self-signed setups (MITM-able).
  const ssl = mode === 'true' ? { rejectUnauthorized: true } : mode === 'no-verify' ? { rejectUnauthorized: false } : undefined;
  return new pg.Pool({ connectionString: stripSslParams(url, mode), max, idleTimeoutMillis: max <= 3 ? 10000 : 30000, connectionTimeoutMillis: 5000, ssl, allowExitOnIdle: max <= 3 });
}
/** sslmode=… in the URL would override the explicit ssl object in node-postgres; DATABASE_SSL decides instead. */
function stripSslParams(url: string, mode: string): string {
  if (mode === 'false') return url;
  try { const u = new URL(url); for (const k of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl', 'channel_binding']) u.searchParams.delete(k); return u.toString(); } catch { return url; }
}
