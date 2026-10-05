import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { clientIp } from './lib/clientip.js';
import { randomUUID } from 'node:crypto';
import { durationToSec, restKvOptions, type Config } from './config.js';
import { createPool, type Db, type SslMode } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { seedAdmin, seedSystemPresets } from './db/seed.js';
import { createKV, kvRateStore, type KV } from './lib/kv.js';
import { parseKey } from './lib/crypto.js';
import { AppError, unauthorized } from './lib/errors.js';
import { tokenIsCurrent } from './lib/sessions.js';
import { LLMService } from './llm/service.js';
import type { FetchFn } from './llm/client.js';
import type { LookupFn } from './lib/netguard.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import metaRoutes from './routes/meta.js';
import aiRoutes from './routes/ai.js';
import adminRoutes from './routes/admin.js';

export const VERSION = '1.0.0';
declare module 'fastify' {
  interface FastifyInstance { db: Db; kv: KV; cfg: Config; llm: LLMService; authenticate: (req: FastifyRequest) => Promise<void> }
  interface FastifyRequest { uid?: string; role?: 'admin' | 'user'; email?: string; tv?: number }
}
// tv = users.token_version at issue time (session revocation); optional so pre-revocation tokens still decode
declare module '@fastify/jwt' { interface FastifyJWT { payload: { sub: string; role: 'admin' | 'user'; tv?: number }; user: { sub: string; role: 'admin' | 'user'; tv?: number } } }

export interface AppDeps {
  db?: Db; kv?: KV; logger?: boolean | object; lookup?: LookupFn;
  /** fetch for server-configured providers (tests inject a fake) */
  fetch?: FetchFn;
  /** fetch for user-supplied base URLs. Not set → deps.fetch if injected, else the connect-time SSRF-guarded fetch;
   *  explicitly `undefined` → always the guarded fetch (tests of the guard itself). */
  userFetch?: FetchFn;
}

/** a non-loopback Redis URL without credentials (anyone on that network could read/flush rate-limit and quota keys) */
export function redisWithoutPassword(url: string): boolean {
  try { const u = new URL(url); return !u.password && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname); } catch { return false; }
}

export async function buildApp(cfg: Config, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: cfg.TRUST_PROXY as any, bodyLimit: 1024 * 1024,
    // accept an upstream request id only if it looks sane (no log/header injection)
    genReqId: req => { const h = String(req.headers['x-request-id'] || ''); return /^[A-Za-z0-9._:-]{8,128}$/.test(h) ? h : randomUUID(); },
    logger: deps.logger ?? { level: cfg.LOG_LEVEL, redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'], censor: '[redacted]' } },
  });
  const db = deps.db || createPool(cfg.DATABASE_URL, { ssl: cfg.DATABASE_SSL as SslMode, max: cfg.DB_POOL_MAX });
  const kv = deps.kv || createKV(cfg.REDIS_URL, restKvOptions(cfg));
  if (kv.kind === 'memory' && cfg.NODE_ENV === 'production') app.log.warn('REDIS_URL not set: rate limits/quotas are per-instance (in-memory)');
  if (kv.kind === 'redis' && cfg.NODE_ENV === 'production' && redisWithoutPassword(cfg.REDIS_URL)) app.log.warn('REDIS_URL has no password: protect Redis with requirepass (docker compose: REDIS_PASSWORD)');
  app.decorate('db', db); app.decorate('kv', kv); app.decorate('cfg', cfg);
  app.decorate('llm', new LLMService(db, cfg, kv, deps.fetch || fetch, parseKey(cfg.ENCRYPTION_KEY), deps.lookup, 'userFetch' in deps ? deps.userFetch : deps.fetch));
  app.addHook('onClose', async () => { await app.llm.close(); if (!deps.db) await db.end(); if (!deps.kv) await kv.close(); });
  app.addHook('onSend', async (req, reply) => { reply.header('x-request-id', req.id); });

  // Wait for PostgreSQL (container start-up ordering, restarts) — DB_CONNECT_RETRIES × 1s (0 = skip, e.g. serverless)
  for (let i = 1; cfg.DB_CONNECT_RETRIES > 0; i++) {
    try { await db.query('SELECT 1'); break; }
    catch (e) { if (i >= cfg.DB_CONNECT_RETRIES) throw e; app.log.warn(`database not ready (${(e as Error).message}), retry ${i}/${cfg.DB_CONNECT_RETRIES}`); await new Promise(r => setTimeout(r, 1000)); }
  }

  if (cfg.MIGRATE_ON_START) {
    await migrate(db, m => app.log.info(m));
    await seedSystemPresets(db);
    await seedAdmin(db, cfg, m => app.log.info(m));
  }

  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: 'same-site' } });
  const origins = cfg.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  await app.register(cors, { origin: (o, cb) => cb(null, !o || origins.includes(o)), credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], maxAge: 600 });
  await app.register(cookie);
  await app.register(jwt, {
    secret: cfg.JWT_SECRET, cookie: { cookieName: cfg.COOKIE_NAME, signed: false },
    sign: { algorithm: 'HS256', expiresIn: durationToSec(cfg.JWT_EXPIRES_IN) * 1000 },
    verify: { algorithms: ['HS256'] },
  });

  // Decode the session early (non-fatal) so rate limits can key on the user id.
  app.addHook('onRequest', async req => {
    try { const p = await req.jwtVerify<{ sub: string; role: 'admin' | 'user'; tv?: number }>(); req.uid = p.sub; req.role = p.role; req.tv = Number(p.tv ?? 0); } catch { /* anonymous */ }
  });
  await app.register(rateLimit, {
    global: true, max: cfg.API_RATE_PER_MIN, timeWindow: '1 minute', redis: kv.redis, nameSpace: 'rl:', ...(kv.hit ? { store: kvRateStore(kv) as any } : {}),
    keyGenerator: req => (req.uid ? 'u:' + req.uid : 'ip:' + clientIp(req)),
    errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, code: 'rate_limited', error: 'Too Many Requests', message: `เรียกถี่เกินไป — ลองใหม่ใน ${Math.ceil(ctx.ttl / 1000)} วินาที` }),
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    if (!req.uid) throw unauthorized();
    // one indexed lookup per authenticated request: role changes and revocations take effect immediately
    const r = await db.query('SELECT id, role, email, token_version, disabled_at FROM users WHERE id = $1', [req.uid]);
    if (!r.rowCount) throw unauthorized('session is no longer valid');
    if (r.rows[0].disabled_at) throw new AppError(401, 'account_disabled', 'บัญชีนี้ถูกระงับ — ติดต่อผู้ดูแลระบบ');
    if (!tokenIsCurrent(req.tv, r.rows[0].token_version)) throw new AppError(401, 'session_revoked', 'session ถูกยกเลิก (ออกจากระบบทุกอุปกรณ์ / เปลี่ยนรหัสผ่าน) — กรุณาเข้าสู่ระบบใหม่');
    req.role = r.rows[0].role; req.email = r.rows[0].email;
  });

  // Mutating requests must be JSON (blocks classic form-based CSRF together with SameSite=Lax cookies).
  app.addHook('preHandler', async req => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.body !== undefined && !String(req.headers['content-type'] || '').includes('application/json'))
      throw new AppError(415, 'unsupported_media_type', 'Content-Type must be application/json');
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof AppError) return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, 'unhandled error'); else req.log.info({ code: err.code, msg: err.message }, 'client error');
    const code = status === 429 ? 'rate_limited' : err.validation ? 'validation_error' : status === 413 ? 'payload_too_large' : status >= 500 ? 'internal_error' : (err.code || 'bad_request');
    return reply.status(status).send({ error: { code: String(code).toLowerCase(), message: status >= 500 ? 'Internal server error' : err.message } });
  });
  app.setNotFoundHandler((req, reply) => reply.status(404).send({ error: { code: 'not_found', message: `Route ${req.method} ${req.url} not found` } }));

  app.get('/api/v1/health', { config: { rateLimit: false } }, async (_req, reply) => {
    let dbOk = false; try { await db.query('SELECT 1'); dbOk = true; } catch { /* down */ }
    const kvOk = await kv.ping();
    const ok = dbOk && kvOk;
    return reply.status(ok ? 200 : 503).send({ status: ok ? 'ok' : 'degraded', version: VERSION, uptime_s: Math.round(process.uptime()), db: dbOk, cache: { kind: kv.kind, ok: kvOk } });
  });
  app.get('/api/v1/health/live', { logLevel: 'silent', config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(metaRoutes, { prefix: '/api/v1' });
  await app.register(projectRoutes, { prefix: '/api/v1' });
  await app.register(aiRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1' });
  return app;
}
