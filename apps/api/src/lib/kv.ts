import { Redis } from 'ioredis';

/** Small key-value abstraction: Redis in production, in-memory fallback for dev/tests without Redis. */
export interface KV {
  kind: 'redis' | 'memory' | 'upstash-rest';
  redis?: Redis;
  /** fixed-window hit counter for the rate limiter (REST backend only) */
  hit?(key: string, windowMs: number): Promise<{ current: number; ttl: number }>;
  incr(key: string, ttlSec: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, val: string, ttlSec: number): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
export interface RestOptions { url: string; token: string; fetch?: typeof fetch }

/**
 * Upstash Redis over HTTPS (REST) — for serverless platforms where a TCP connection per instance is undesirable.
 * Used when REDIS_URL is empty and UPSTASH_REDIS_REST_URL/TOKEN (or Vercel's KV_REST_API_URL/TOKEN) are set.
 */
export function createRestKV(o: RestOptions): KV {
  const f = o.fetch || fetch; const base = o.url.replace(/\/$/, '');
  const pipe = async (cmds: (string | number)[][]): Promise<any[]> => {
    const r = await f(base + '/pipeline', { method: 'POST', headers: { authorization: `Bearer ${o.token}`, 'content-type': 'application/json' }, body: JSON.stringify(cmds), signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`upstash HTTP ${r.status}`);
    const out = await r.json() as { result?: unknown; error?: string }[];
    const err = out.find(x => x.error); if (err) throw new Error('upstash: ' + err.error);
    return out.map(x => x.result);
  };
  return {
    kind: 'upstash-rest',
    async incr(k, ttl) { const [v] = await pipe([['INCR', k], ['EXPIRE', k, ttl, 'NX']]); return Number(v); },
    async hit(k, windowMs) { const [v, , ttl] = await pipe([['INCR', k], ['PEXPIRE', k, windowMs, 'NX'], ['PTTL', k]]); return { current: Number(v), ttl: Math.max(0, Number(ttl)) }; },
    async get(k) { const [v] = await pipe([['GET', k]]); return v == null ? null : String(v); },
    async set(k, v, ttl) { await pipe([['SET', k, v, 'EX', ttl]]); },
    async ping() { try { const [v] = await pipe([['PING']]); return v === 'PONG'; } catch { return false; } },
    async close() { /* stateless */ },
  };
}

/** @fastify/rate-limit store backed by KV.hit (Upstash REST). */
export function kvRateStore(kv: KV) {
  return class KvStore {
    prefix: string;
    constructor(_opts?: unknown, prefix = 'rl:') { this.prefix = prefix; }
    incr(key: string, cb: (err: Error | null, res: { current: number; ttl: number } | null) => void, timeWindow: number) {
      kv.hit!(this.prefix + key, timeWindow).then(r => cb(null, r), e => cb(e, null));
    }
    child(ro: { routeInfo: { method: string; url: string } }) { return new KvStore(ro, `${this.prefix}${ro.routeInfo.method}${ro.routeInfo.url}-`); }
  };
}

export function createKV(url: string, rest?: RestOptions | null): KV {
  if (!url && rest?.url && rest.token) return createRestKV(rest);
  if (!url) {
    const m = new Map<string, { v: string; exp: number }>();
    const live = (k: string) => { const e = m.get(k); if (e && e.exp < Date.now()) { m.delete(k); return undefined; } return e; };
    return {
      kind: 'memory',
      async incr(k, ttl) { const e = live(k); const v = (e ? +e.v : 0) + 1; m.set(k, { v: String(v), exp: e ? e.exp : Date.now() + ttl * 1000 }); return v; },
      async get(k) { return live(k)?.v ?? null; },
      async set(k, v, ttl) { m.set(k, { v, exp: Date.now() + ttl * 1000 }); },
      async ping() { return true; },
      async close() { m.clear(); },
    };
  }
  const redis = new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: true, lazyConnect: false });
  redis.on('error', () => { /* logged by health checks; avoid crashing */ });
  return {
    kind: 'redis', redis,
    async incr(k, ttl) { const v = await redis.incr(k); if (v === 1) await redis.expire(k, ttl); return v; },
    async get(k) { return redis.get(k); },
    async set(k, v, ttl) { await redis.set(k, v, 'EX', ttl); },
    async ping() { try { return (await redis.ping()) === 'PONG'; } catch { return false; } },
    async close() { await redis.quit().catch(() => redis.disconnect()); },
  };
}
