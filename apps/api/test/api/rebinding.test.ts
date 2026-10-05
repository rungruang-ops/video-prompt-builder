import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { makeApp, resetDb, session } from '../helpers.js';
// @ts-ignore — plain JS stub shared with the docker "stub" profile
import { respond } from '../../../../tools/stub-llm/stub.mjs';

// End-to-end through the API: user-supplied base URLs use the connect-time guarded fetch (no fake fetch here).
let app: any; let srv: http.Server; let port = 0; let hits: string[] = [];
let n = 0; const DNS: Record<string, () => string[]> = {
  'rebind.attacker.test': () => (n++ === 0 ? ['93.184.216.34'] : ['127.0.0.1']),   // public for the pre-check, loopback at connect
  'llm.allowed.test': () => ['127.0.0.1'],
};
beforeAll(async () => {
  srv = http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => { hits.push(`${req.headers.host} ${req.url}`); const r = respond(req.url, req.headers, body); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(r.json)); });
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  port = (srv.address() as any).port;
  await resetDb();
  ({ app } = await makeApp({ ALLOW_USER_BASE_URL: 'all', LLM_URL_ALLOWLIST: 'llm.allowed.test' } as any, [],
    { userFetch: undefined, lookup: async (h: string) => { const f = DNS[h]; if (!f) throw new Error('ENOTFOUND'); return f(); } }));
});
afterAll(async () => { await app?.close(); await new Promise<void>(r => srv.close(() => r())); });

const configure = (s: any, baseUrl: string) => app.inject({ method: 'PUT', url: '/api/v1/ai/settings', cookies: s.cookies,
  payload: { defaultProvider: 'custom', providers: { custom: { baseUrl, model: 'stub-model' } } } });
const test_ = (s: any) => app.inject({ method: 'POST', url: '/api/v1/ai/test', cookies: s.cookies, payload: { provider: 'custom' } });

describe('custom base URL: DNS rebinding window is closed', () => {
  it('a host that re-resolves to loopback after the pre-check is refused at connect time (400 unsafe_base_url, no retry)', async () => {
    const s = await session(app, 'rebind@example.com');
    n = 0; expect((await configure(s, `http://rebind.attacker.test:${port}/v1`)).statusCode).toBe(200);   // save-time check: public
    n = 0; hits = [];
    const r = await test_(s);                                                                              // call: pre-check public → connect loopback
    expect(r.statusCode).toBe(400); expect(r.json().error.code).toBe('unsafe_base_url');
    expect(hits).toEqual([]);
    expect(n).toBe(2);                                                                                     // pre-check + one connect attempt (not retried)
  });
  it('allowlisted internal hosts still work through the guarded fetch (Host header preserved)', async () => {
    const s = await session(app, 'allowed@example.com');
    expect((await configure(s, `http://llm.allowed.test:${port}/v1`)).statusCode).toBe(200);
    hits = [];
    const r = await test_(s);
    expect(r.statusCode).toBe(200); expect(r.json().ok).toBe(true);
    expect(hits).toEqual([`llm.allowed.test:${port} /v1/chat/completions`]);
  });
});
