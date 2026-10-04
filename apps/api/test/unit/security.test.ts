import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { loadConfig, durationToSec } from '../../src/config.js';
import { isPrivateIp, assertSafeBaseUrl, redactSecrets } from '../../src/lib/netguard.js';
import { callProvider } from '../../src/llm/client.js';

const strong = { JWT_SECRET: randomBytes(48).toString('base64'), ENCRYPTION_KEY: randomBytes(32).toString('base64') };
const prodDb = 'postgres://app:S3cure-Random-Pw@db.example.net:5432/vpb';

describe('config hardening', () => {
  it('production refuses placeholder secrets, default DB password and the stub LLM', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', ...strong, DATABASE_URL: prodDb })).not.toThrow();
    expect(() => loadConfig({ NODE_ENV: 'production', ...strong, JWT_SECRET: 'CHANGE-ME-generate-with-openssl-rand-base64-48' , DATABASE_URL: prodDb })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', ...strong, ENCRYPTION_KEY: Buffer.from('dev-only-change-me-32-bytes-key!').toString('base64'), DATABASE_URL: prodDb })).toThrow(/ENCRYPTION_KEY/);
    expect(() => loadConfig({ NODE_ENV: 'production', ...strong, ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), DATABASE_URL: prodDb })).toThrow(/ENCRYPTION_KEY/);
    expect(() => loadConfig({ NODE_ENV: 'production', ...strong })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ NODE_ENV: 'production', ...strong, DATABASE_URL: 'postgres://vpb:change-me-db-password@postgres:5432/vpb' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ NODE_ENV: 'production', ...strong, DATABASE_URL: prodDb, CUSTOM_LLM_BASE_URL: 'http://stub-llm:9999/v1' })).toThrow(/stub LLM/);
    expect(() => loadConfig({ NODE_ENV: 'production', ...strong, DATABASE_URL: prodDb, CUSTOM_LLM_BASE_URL: 'http://stub-llm:9999/v1', ALLOW_STUB_LLM: 'true' })).not.toThrow();
    expect(() => loadConfig({ ...strong, ENCRYPTION_KEY: 'CHANGE-ME' })).toThrow(/openssl rand -base64 32/);
  });
  it('parses TRUST_PROXY, DATABASE_SSL, ALLOW_USER_BASE_URL and JWT_EXPIRES_IN', () => {
    expect(loadConfig({ ...strong }).TRUST_PROXY).toBe(1);
    expect(loadConfig({ ...strong, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    expect(loadConfig({ ...strong, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    expect(loadConfig({ ...strong, TRUST_PROXY: '10.0.0.0/8, 127.0.0.1' }).TRUST_PROXY).toEqual(['10.0.0.0/8', '127.0.0.1']);
    expect(loadConfig({ ...strong, DATABASE_SSL: 'require' }).DATABASE_SSL).toBe('true');
    expect(loadConfig({ ...strong, DATABASE_SSL: 'no-verify' }).DATABASE_SSL).toBe('no-verify');
    expect(loadConfig({ ...strong }).ALLOW_USER_BASE_URL).toBe('off');
    expect(loadConfig({ ...strong, ALLOW_USER_BASE_URL: 'true' }).ALLOW_USER_BASE_URL).toBe('all');
    expect(loadConfig({ ...strong, ALLOW_USER_BASE_URL: 'admin' }).ALLOW_USER_BASE_URL).toBe('admin');
    expect(() => loadConfig({ ...strong, JWT_EXPIRES_IN: 'forever' })).toThrow(/JWT_EXPIRES_IN/);
    expect(durationToSec('7d')).toBe(604800); expect(durationToSec('12h')).toBe(43200); expect(durationToSec('900')).toBe(900);
  });
});

describe('SSRF guard', () => {
  it('classifies internal addresses', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1'])
      expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700::1111']) expect(isPrivateIp(ip), ip).toBe(false);
  });
  it('blocks internal targets, allows public ones and the allowlist', async () => {
    const lookup = async (h: string) => (h === 'llm.public.test' ? ['93.184.216.34'] : h === 'evil.test' ? ['169.254.169.254'] : h === 'mixed.test' ? ['8.8.8.8', '10.0.0.1'] : []);
    const o = { allowPrivate: false, allowlist: ['ollama.lan', '*.corp.example'], lookup };
    for (const u of ['http://127.0.0.1:11434/v1', 'http://localhost/v1', 'http://[::1]/v1', 'http://169.254.169.254/latest', 'http://evil.test/v1', 'http://mixed.test/v1', 'http://metadata.google.internal/', 'file:///etc/passwd', 'http://user:pw@llm.public.test/', 'http://nx.test/'])
      await expect(assertSafeBaseUrl(u, o), u).rejects.toMatchObject({ code: 'unsafe_base_url' });
    await expect(assertSafeBaseUrl('https://llm.public.test/v1', o)).resolves.toBeUndefined();
    await expect(assertSafeBaseUrl('http://ollama.lan:11434/v1', o)).resolves.toBeUndefined();
    await expect(assertSafeBaseUrl('http://gpu1.corp.example/v1', o)).resolves.toBeUndefined();
    await expect(assertSafeBaseUrl('http://10.0.0.9/v1', { ...o, allowPrivate: true })).resolves.toBeUndefined();
  });
  it('redacts credentials from upstream error text', () => {
    // fake key-shaped strings are assembled at runtime so secret scanners don't flag the test file
    const fakeOpenAI = ['sk', 'proj', 'abcdEFGH1234567890'].join('-'), fakeGemini = 'AIza' + 'SyA1234567890abcdefghijk';
    const t = redactSecrets(`Incorrect API key provided: ${fakeOpenAI}. Also ${fakeGemini} and Bearer abcdefghijklmnop and my-secret-value`, 'my-secret-value');
    expect(t).not.toMatch(/sk-proj|AIza|abcdefghijklmnop|my-secret-value/);
  });
});

describe('provider client hardening', () => {
  const FAKE_KEY = ['sk', 'test', 'SECRET', '123456789'].join('-');
  const p = { id: 'openai' as const, baseUrl: 'https://api.openai.com/v1', apiKey: FAKE_KEY, model: 'm', temperature: null, maxTokens: 64 };
  it('never follows redirects and strips the key from error messages', async () => {
    let init: any;
    const fetch = (async (_u: any, i: any) => { init = i; return new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${FAKE_KEY}` } }), { status: 401 }); }) as any;
    const e: any = await callProvider(p, { system: 's', messages: [{ role: 'user', content: 'x' }] }, { fetch, timeoutMs: 1000, retries: 0 }).catch(x => x);
    expect(init.redirect).toBe('error');
    expect(e.code).toBe('provider_auth'); expect(e.message).not.toContain('SECRET');
  });
  it('respects the total time budget across retries (serverless maxDuration)', async () => {
    const fetch = (async (_u: any, i: any) => new Promise((_, rej) => i.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as any;
    const t0 = Date.now();
    const e: any = await callProvider(p, { system: 's', messages: [{ role: 'user', content: 'x' }] }, { fetch, timeoutMs: 400, totalTimeoutMs: 600, retries: 5, sleep: async () => {} }).catch(x => x);
    expect(e.code).toBe('provider_timeout'); expect(Date.now() - t0).toBeLessThan(1500);
  });
});
