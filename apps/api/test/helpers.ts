import pg from 'pg';
import { loadConfig, type Config } from '../src/config.js';
import { buildApp, type AppDeps } from '../src/app.js';
import { createKV } from '../src/lib/kv.js';
// @ts-ignore — plain JS stub shared with the docker "stub" profile
import { respond } from '../../../tools/stub-llm/stub.mjs';

export const TEST_DB = process.env.TEST_DATABASE_URL || 'postgres://vpb:vpb@localhost:5432/vpb_test';
export interface Call { url: string; headers: Record<string, string>; body: any }

/** fetch replacement that routes provider calls to the in-process stub and records them. */
export function makeFakeFetch(calls: Call[]) {
  return (async (input: any, init: any = {}) => {
    const url = String(input);
    const headers: Record<string, string> = {}; for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = String(v);
    calls.push({ url, headers, body: init.body ? JSON.parse(init.body) : null });
    if (url.includes('unreachable.invalid')) throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } } as any);
    if (url.includes('slow.invalid')) return new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const r = respond(url, headers, init.body);
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

/** deterministic DNS for the SSRF guard: *.public.test → public IP, *.private.test → internal IP */
export const fakeLookup = async (host: string) => host.endsWith('.private.test') ? ['10.1.2.3'] : host.endsWith('.public.test') ? ['93.184.216.34'] : host === 'rebind.test' ? ['93.184.216.34', '127.0.0.1'] : (() => { throw new Error('ENOTFOUND'); })();

export async function resetDb() {
  const c = new pg.Client({ connectionString: TEST_DB }); await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.end();
}

export async function makeApp(over: Partial<Config> = {}, calls: Call[] = [], deps: Partial<AppDeps> = {}) {
  const cfg = loadConfig({
    NODE_ENV: 'test', DATABASE_URL: TEST_DB, REDIS_URL: process.env.TEST_REDIS_URL || '', LOG_LEVEL: 'silent',
    JWT_SECRET: 'test-secret-test-secret-test-secret-1234', ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    CORS_ORIGINS: 'http://localhost:5173', ALLOW_USER_BASE_URL: 'true', LLM_MAX_RETRIES: '1', LLM_TIMEOUT_MS: '300',
    LLM_URL_ALLOWLIST: 'stub.local,unreachable.invalid,slow.invalid',
  } as any, over);
  const kv = createKV(cfg.REDIS_URL);
  if (kv.redis) await kv.redis.flushdb();   // tests use a dedicated Redis DB index (e.g. redis://localhost:6379/15)
  const app = await buildApp(cfg, { fetch: makeFakeFetch(calls), logger: false, kv, lookup: fakeLookup, ...deps });
  app.addHook('onClose', async () => { await kv.close(); });
  return { app, cfg, calls };
}

/** Register (or login) and return a cookie header object for app.inject. */
export async function session(app: any, email: string, password = 'password123') {
  let r = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email, password } });
  if (r.statusCode === 409) r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
  const c = r.cookies.find((x: any) => x.name === 'vpb_session');
  if (!c) throw new Error('no session cookie: ' + r.body);
  return { cookies: { vpb_session: c.value }, user: r.json().user };
}
