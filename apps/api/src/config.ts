import { z } from 'zod';

const bool = (d: boolean) => z.preprocess(v => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase())), z.boolean());
const num = (d: number) => z.preprocess(v => (v === undefined || v === '' ? d : Number(v)), z.number().finite());
const str = (d = '') => z.preprocess(v => (v === undefined ? d : String(v)), z.string());
/** true / false / hop count (recommended: 1 behind nginx or Vercel) / comma list of trusted proxy IPs/CIDRs */
const trust = (d: number) => z.preprocess(v => {
  if (v === undefined || v === '') return d;
  const t = String(v).trim().toLowerCase();
  if (t === 'true') return true; if (t === 'false') return false;
  if (/^\d+$/.test(t)) return Number(t);
  return String(v).split(',').map(x => x.trim()).filter(Boolean);
}, z.union([z.boolean(), z.number().int().min(0), z.array(z.string())]));
const enumOf = <T extends string>(vals: readonly [T, ...T[]], d: T, alias: Record<string, T> = {}) =>
  z.preprocess(v => { if (v === undefined || v === '') return d; const t = String(v).trim().toLowerCase(); return alias[t] ?? t; }, z.enum(vals));

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: str('0.0.0.0'),
  PORT: num(8080),
  LOG_LEVEL: str('info'),
  TRUST_PROXY: trust(1),
  DATABASE_URL: str('postgres://vpb:vpb@localhost:5432/vpb'),
  // false | true (verify certificate — Neon, RDS, Supabase …) | no-verify (self-signed; vulnerable to MITM)
  DATABASE_SSL: enumOf(['false', 'true', 'no-verify'] as const, 'false', { '0': 'false', no: 'false', off: 'false', '1': 'true', yes: 'true', on: 'true', require: 'true' }),
  DB_POOL_MAX: num(10),
  DB_CONNECT_RETRIES: num(30),
  MIGRATE_ON_START: bool(true),
  REDIS_URL: str(''),
  // Upstash REST alternative (used only when REDIS_URL is empty). Vercel's Upstash integration names: KV_REST_API_URL / KV_REST_API_TOKEN
  UPSTASH_REDIS_REST_URL: str(''), UPSTASH_REDIS_REST_TOKEN: str(''),
  KV_REST_API_URL: str(''), KV_REST_API_TOKEN: str(''),
  JWT_SECRET: str(''),
  JWT_EXPIRES_IN: str('7d'),
  ENCRYPTION_KEY: str(''),
  COOKIE_SECURE: bool(false),
  COOKIE_NAME: str('vpb_session'),
  CORS_ORIGINS: str('http://localhost:5173,http://localhost:8080'),
  REGISTRATION_OPEN: bool(true),
  ADMIN_EMAIL: str(''),
  ADMIN_PASSWORD: str(''),
  API_RATE_PER_MIN: num(300),
  AUTH_RATE_PER_MIN: num(10),
  LLM_RATE_PER_MIN: num(20),
  LLM_DAILY_QUOTA: num(200),
  LLM_TIMEOUT_MS: num(60000),
  LLM_MAX_RETRIES: num(2),
  ALLOW_USER_KEYS: bool(true),
  // off (only env *_BASE_URL) | admin (admins may set a base URL) | all (every user — internal tools only)
  ALLOW_USER_BASE_URL: enumOf(['off', 'admin', 'all'] as const, 'off', { false: 'off', '0': 'off', no: 'off', true: 'all', '1': 'all', yes: 'all' }),
  LLM_ALLOW_PRIVATE_URLS: bool(false),
  LLM_URL_ALLOWLIST: str(''),
  LLM_TOTAL_TIMEOUT_MS: num(110000),
  ALLOW_STUB_LLM: bool(false),
  DEFAULT_LLM_PROVIDER: str(''),
  OPENAI_API_KEY: str(''), OPENAI_BASE_URL: str(''), OPENAI_MODEL: str(''),
  GEMINI_API_KEY: str(''), GEMINI_BASE_URL: str(''), GEMINI_MODEL: str(''),
  ANTHROPIC_API_KEY: str(''), ANTHROPIC_BASE_URL: str(''), ANTHROPIC_MODEL: str(''),
  XAI_API_KEY: str(''), XAI_BASE_URL: str(''), XAI_MODEL: str(''),
  OPENROUTER_API_KEY: str(''), OPENROUTER_BASE_URL: str(''), OPENROUTER_MODEL: str(''),
  OLLAMA_API_KEY: str(''), OLLAMA_BASE_URL: str(''), OLLAMA_MODEL: str(''),
  CUSTOM_LLM_API_KEY: str(''), CUSTOM_LLM_BASE_URL: str(''), CUSTOM_LLM_MODEL: str(''),
});
export type Config = z.infer<typeof Schema>;

/** requireSecrets=false: for tooling that only needs the DB (migrations) — skips JWT/encryption checks. */
export function loadConfig(env: Record<string, string | undefined> = process.env, overrides: Partial<Config> = {}, { requireSecrets = true } = {}): Config {
  const parsed = Schema.safeParse(env);
  if (!parsed.success) throw new Error('Invalid environment: ' + parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  const c = { ...parsed.data, ...overrides };
  const problems: string[] = [];
  if (!requireSecrets) return c;
  if (c.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be at least 32 characters — generate: openssl rand -base64 48  (or npm run env:init)');
  if (!/^[A-Za-z0-9+/=]{43,44}$|^[0-9a-fA-F]{64}$/.test(c.ENCRYPTION_KEY)) problems.push('ENCRYPTION_KEY must be 32 bytes as base64 (44 chars) or hex (64 chars) — generate: openssl rand -base64 32  (or npm run env:init)');
  if (c.NODE_ENV === 'production') {
    const placeholder = /change-?me|dev-only|ci-only|example|placeholder/i;
    if (placeholder.test(c.JWT_SECRET)) problems.push('JWT_SECRET still uses a placeholder value');
    let decoded = ''; try { decoded = Buffer.from(c.ENCRYPTION_KEY, /^[0-9a-f]{64}$/i.test(c.ENCRYPTION_KEY) ? 'hex' : 'base64').toString('latin1'); } catch { /* format checked above */ }
    if (placeholder.test(decoded) || /^(.)\1+$/s.test(decoded)) problems.push('ENCRYPTION_KEY still uses a placeholder value');
    let dbPw = ''; try { dbPw = decodeURIComponent(new URL(c.DATABASE_URL).password); } catch { /* not a URL */ }
    if (placeholder.test(dbPw) || dbPw === 'vpb') problems.push('DATABASE_URL uses a default/placeholder password');
    if (!c.ALLOW_STUB_LLM) for (const k of Object.keys(c) as (keyof Config)[])
      if (k.endsWith('_BASE_URL') && /\/\/(stub-llm|localhost:9999|127\.0\.0\.1:9999)\b/.test(String(c[k]))) problems.push(`${k} points at the stub LLM (set ALLOW_STUB_LLM=true only for demos)`);
  }
  if (!/^\d+\s*[smhd]?$/i.test(c.JWT_EXPIRES_IN.trim())) problems.push('JWT_EXPIRES_IN must look like 3600, 30m, 12h or 7d');
  if (c.LLM_TOTAL_TIMEOUT_MS < c.LLM_TIMEOUT_MS) problems.push('LLM_TOTAL_TIMEOUT_MS must be >= LLM_TIMEOUT_MS');
  if (problems.length) throw new Error('Configuration error: ' + problems.join('; '));
  return c;
}

/** '7d' | '12h' | '30m' | '3600' (seconds) → seconds */
export function restKvOptions(c: Config) {
  const url = c.UPSTASH_REDIS_REST_URL || c.KV_REST_API_URL, token = c.UPSTASH_REDIS_REST_TOKEN || c.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

export function durationToSec(v: string): number {
  const m = String(v).trim().match(/^(\d+)\s*([smhd]?)$/i);
  if (!m) return 7 * 86400;
  return Number(m[1]) * ({ s: 1, m: 60, h: 3600, d: 86400, '': 1 } as Record<string, number>)[m[2].toLowerCase()];
}
