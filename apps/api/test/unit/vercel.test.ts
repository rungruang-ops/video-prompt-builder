import { describe, it, expect } from 'vitest';
import { restoreUrl, serverlessEnv } from '../../src/vercel.js';
import { createRestKV, createKV } from '../../src/lib/kv.js';
import { loadConfig, restKvOptions } from '../../src/config.js';

describe('Vercel adapter', () => {
  it('restores the original /api path from the rewrite query', () => {
    expect(restoreUrl('/api?__vpb_path=v1%2Fprojects%2Fabc%2Fversions')).toBe('/api/v1/projects/abc/versions');
    expect(restoreUrl('/api?__vpb_path=v1/history&limit=5&kind=ai.test')).toBe('/api/v1/history?limit=5&kind=ai.test');
    expect(restoreUrl('/api/v1/health')).toBe('/api/v1/health');           // platform already passed the original URL
    expect(restoreUrl('/api/v1/history?limit=5')).toBe('/api/v1/history?limit=5');
  });
  it('serverless defaults: production, no migrations on cold start, small pool, timeouts below maxDuration; env wins', () => {
    const e = serverlessEnv({ DB_POOL_MAX: '2', REDIS_URL: '' } as any);
    expect(e).toMatchObject({ NODE_ENV: 'production', MIGRATE_ON_START: 'false', DB_POOL_MAX: '2', COOKIE_SECURE: 'true', LLM_MAX_RETRIES: '1' });
    expect(Number(e.LLM_TOTAL_TIMEOUT_MS)).toBeLessThan(120_000);
  });
});

describe('Upstash REST KV', () => {
  const fake = () => {
    const m = new Map<string, { v: string; exp: number }>(); const seen: string[][] = [];
    const f = (async (_u: any, init: any) => {
      expect(init.headers.authorization).toBe('Bearer tok');
      const cmds: string[][] = JSON.parse(init.body); seen.push(...cmds);
      const out = cmds.map(([c, k, a, b]) => {
        const e = m.get(k);
        switch (c) {
          case 'INCR': { const v = (e ? +e.v : 0) + 1; m.set(k, { v: String(v), exp: e?.exp ?? 0 }); return { result: v }; }
          case 'EXPIRE': case 'PEXPIRE': { const ms = c === 'EXPIRE' ? +a * 1000 : +a; const x = m.get(k)!; if (b === 'NX' && x.exp) return { result: 0 }; x.exp = Date.now() + ms; return { result: 1 }; }
          case 'PTTL': return { result: e?.exp ? e.exp - Date.now() : -1 };
          case 'GET': return { result: e?.v ?? null };
          case 'SET': m.set(k, { v: a, exp: 0 }); return { result: 'OK' };
          case 'PING': return { result: 'PONG' };
          default: return { error: 'ERR unknown' };
        }
      });
      return new Response(JSON.stringify(out), { status: 200 });
    }) as any;
    return { f, seen };
  };
  it('implements incr/get/set/ping/hit over the REST pipeline', async () => {
    const { f, seen } = fake();
    const kv = createRestKV({ url: 'https://x.upstash.io/', token: 'tok', fetch: f });
    expect(kv.kind).toBe('upstash-rest');
    expect(await kv.incr('q', 60)).toBe(1); expect(await kv.incr('q', 60)).toBe(2);
    expect(await kv.get('q')).toBe('2'); await kv.set('s', 'v', 10); expect(await kv.get('s')).toBe('v');
    expect(await kv.ping()).toBe(true);
    const h1 = await kv.hit!('rl:a', 60000), h2 = await kv.hit!('rl:a', 60000);
    expect(h1.current).toBe(1); expect(h2.current).toBe(2); expect(h2.ttl).toBeGreaterThan(59000);
    expect(seen.some(c => c[0] === 'PEXPIRE' && c[3] === 'NX')).toBe(true);
  });
  it('is selected only when REDIS_URL is empty and REST credentials exist (Vercel KV_* names accepted)', () => {
    const base = { JWT_SECRET: 'x'.repeat(40), ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64') };
    expect(restKvOptions(loadConfig({ ...base, KV_REST_API_URL: 'https://a.upstash.io', KV_REST_API_TOKEN: 't' }))).toEqual({ url: 'https://a.upstash.io', token: 't' });
    expect(restKvOptions(loadConfig(base))).toBeNull();
    expect(createKV('', { url: 'https://a.upstash.io', token: 't' }).kind).toBe('upstash-rest');
    expect(createKV('', null).kind).toBe('memory');
  });
});
