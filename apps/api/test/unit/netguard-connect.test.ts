import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import tls from 'node:tls';
import { assertSafeBaseUrl, createGuardedFetch, guardedLookup, UNSAFE_CONNECT, type GuardOptions } from '../../src/lib/netguard.js';

// Connect-time SSRF guard: the DNS answer used for the socket is the one that was checked (closes the rebinding window).
let srv: http.Server; let port = 0; const seen: Array<{ host?: string; url?: string }> = [];
beforeAll(async () => {
  srv = http.createServer((req, res) => { seen.push({ host: req.headers.host, url: req.url }); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  port = (srv.address() as any).port;
});
afterAll(() => new Promise<void>(r => srv.close(() => r())));

const opts = (lookup: GuardOptions['lookup'], extra: Partial<GuardOptions> = {}): GuardOptions => ({ allowPrivate: false, allowlist: [], lookup, ...extra });
const lookupP = (o: GuardOptions, host: string, options: any) => new Promise<any>((res, rej) => guardedLookup(o)(host, options, (e, a, f) => e ? rej(e) : res(f === undefined ? a : { a, f })));

describe('guardedLookup (dns.lookup-compatible)', () => {
  it('returns only checked public addresses, honouring all/family', async () => {
    const o = opts(async () => ['93.184.216.34', '2606:2800:220:1::1']);
    expect(await lookupP(o, 'x.test', { all: true })).toEqual([{ address: '93.184.216.34', family: 4 }, { address: '2606:2800:220:1::1', family: 6 }]);
    expect(await lookupP(o, 'x.test', {})).toEqual({ a: '93.184.216.34', f: 4 });
    expect(await lookupP(o, 'x.test', { family: 6 })).toEqual({ a: '2606:2800:220:1::1', f: 6 });
  });
  it('refuses when any answer is internal; allowlist and LLM_ALLOW_PRIVATE_URLS opt out', async () => {
    for (const addrs of [['127.0.0.1'], ['93.184.216.34', '10.0.0.5'], ['::1'], ['169.254.169.254'], ['::ffff:127.0.0.1']]) {
      await expect(lookupP(opts(async () => addrs), 'evil.test', { all: true })).rejects.toMatchObject({ code: UNSAFE_CONNECT });
    }
    expect(await lookupP(opts(async () => ['127.0.0.1'], { allowlist: ['*.corp.test'] }), 'llm.corp.test', {})).toEqual({ a: '127.0.0.1', f: 4 });
    expect(await lookupP(opts(async () => ['10.0.0.5'], { allowPrivate: true }), 'any.test', {})).toEqual({ a: '10.0.0.5', f: 4 });
    await expect(lookupP(opts(async () => []), 'none.test', {})).rejects.toMatchObject({ code: 'ENOTFOUND' });
  });
});

describe('createGuardedFetch', () => {
  it('DNS rebinding: pre-check sees a public IP, the connection would go to 127.0.0.1 → refused before connecting', async () => {
    let n = 0; const rebinding = async () => (n++ === 0 ? ['93.184.216.34'] : ['127.0.0.1']);   // TTL-0 attacker DNS
    const o = opts(rebinding); const f = createGuardedFetch(o);
    const url = `http://rebind.attacker.test:${port}/v1/chat/completions`;
    await expect(assertSafeBaseUrl(url, o)).resolves.toBeUndefined();                     // step 1 passes…
    const before = seen.length;
    const err: any = await f(url, { method: 'POST', body: '{}' }).catch(e => e);           // …step 2 is refused
    expect(err).toBeInstanceOf(TypeError); expect(err.cause?.code).toBe(UNSAFE_CONNECT);
    expect(seen.length).toBe(before);                                                      // nothing reached the internal server
    await f.close();
  });
  it('allowlisted hosts connect to the pinned address with the original Host header', async () => {
    const f = createGuardedFetch(opts(async () => ['127.0.0.1'], { allowlist: ['llm.allowed.test'] }));
    const r = await f(`http://llm.allowed.test:${port}/v1/models`);
    expect(r.status).toBe(200); expect(await r.json()).toEqual({ ok: true });
    expect(seen.at(-1)).toEqual({ host: `llm.allowed.test:${port}`, url: '/v1/models' });
    await f.close();
  });
  it('TLS uses the URL hostname for SNI (not the pinned IP)', async () => {
    let sni = '';
    const t = tls.createServer({ SNICallback: (name, cb) => { sni = name; cb(new Error('no certificate in this test')); } });
    await new Promise<void>(r => t.listen(0, '127.0.0.1', () => r()));
    const f = createGuardedFetch(opts(async () => ['127.0.0.1'], { allowlist: ['sni.allowed.test'] }));
    await f(`https://sni.allowed.test:${(t.address() as any).port}/v1`).catch(() => {});
    expect(sni).toBe('sni.allowed.test');
    await f.close(); await new Promise<void>(r => t.close(() => r()));
  });
});
