/**
 * Vercel serverless entry: one Function (api/index.mjs → this module) serves every /api/* route.
 * The Fastify app is built once per instance and reused across invocations (Fluid compute).
 * Migrations do NOT run here (MIGRATE_ON_START defaults to false) — use `npm run migrate` or MIGRATE_ON_BUILD.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';

/** Serverless-friendly defaults; anything set in the environment wins. */
export function serverlessEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  return {
    NODE_ENV: 'production', MIGRATE_ON_START: 'false', DB_CONNECT_RETRIES: '2', DB_POOL_MAX: '3',
    LLM_TIMEOUT_MS: '50000', LLM_MAX_RETRIES: '1', LLM_TOTAL_TIMEOUT_MS: '100000',   // < maxDuration (120s) in vercel.json
    COOKIE_SECURE: 'true', TRUST_PROXY: '1', LOG_LEVEL: 'info',
    ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== '')),
  };
}

/** vercel.json rewrites /api/:path* → /api?__vpb_path=:path* ; restore the original URL for Fastify's router. */
export function restoreUrl(url = '/'): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const params = new URLSearchParams(url.slice(q + 1));
  const p = params.get('__vpb_path');
  if (p === null) return url;
  params.delete('__vpb_path');
  const rest = params.toString();
  return '/api/' + p.replace(/^\/+/, '') + (rest ? '?' + rest : '');
}

let appPromise: Promise<FastifyInstance> | null = null;
export function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => { const app = await buildApp(loadConfig(serverlessEnv())); await app.ready(); return app; })();
    appPromise.catch(() => { appPromise = null; });   // retry on the next invocation
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  let app: FastifyInstance;
  try { app = await getApp(); }
  catch (e) {
    console.error('[vpb] API failed to start:', (e as Error).message);
    res.statusCode = 503; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify({ error: { code: 'service_unavailable', message: 'API failed to start — check the server configuration / logs' } }));
    return;
  }
  req.url = restoreUrl(req.url);
  app.server.emit('request', req, res);
}
