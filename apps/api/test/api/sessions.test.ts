import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { makeApp, resetDb, session, TEST_DB } from '../helpers.js';

let app: any;
const j = (r: any) => r.json();
const get = (s: any, url: string) => app.inject({ method: 'GET', url, cookies: s.cookies });
const post = (s: any, url: string, payload: any = {}) => app.inject({ method: 'POST', url, payload, cookies: s.cookies });
const cookieOf = (r: any) => r.cookies.find((c: any) => c.name === 'vpb_session');

beforeAll(async () => {
  await resetDb();
  ({ app } = await makeApp({ AUTH_RATE_PER_MIN: 100 }));
});
afterAll(async () => { await app?.close(); });

describe('session revocation (token_version)', () => {
  it('log out of all devices invalidates every session of that user only', async () => {
    const laptop = await session(app, 'sam@example.com'); const phone = await session(app, 'sam@example.com');
    const other = await session(app, 'other@example.com');
    expect((await get(laptop, '/api/v1/projects')).statusCode).toBe(200);
    expect((await get(phone, '/api/v1/projects')).statusCode).toBe(200);
    const r = await post(laptop, '/api/v1/auth/logout-all');
    expect(r.statusCode).toBe(200); expect(cookieOf(r)?.value).toBe('');            // this device's cookie is cleared too
    for (const s of [laptop, phone]) {
      const x = await get(s, '/api/v1/projects');
      expect(x.statusCode).toBe(401); expect(j(x).error.code).toBe('session_revoked');
      expect(j(await get(s, '/api/v1/auth/session')).user).toBeNull();          // the SPA probe also treats it as logged out
    }
    expect((await get(other, '/api/v1/projects')).statusCode).toBe(200);           // other users unaffected
    const again = await session(app, 'sam@example.com');                            // a fresh login works
    expect((await get(again, '/api/v1/projects')).statusCode).toBe(200);
  });
  it('logout-all requires a valid session', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/logout-all', payload: {} })).statusCode).toBe(401);
  });
  it('password change keeps this device, revokes the others, and the new password works', async () => {
    const a = await session(app, 'pw@example.com'); const b = await session(app, 'pw@example.com');
    const wrong = await post(a, '/api/v1/auth/password', { currentPassword: 'nope-nope', newPassword: 'new-password-456' });
    expect(wrong.statusCode).toBe(400); expect(j(wrong).error.code).toBe('invalid_current_password');
    const same = await post(a, '/api/v1/auth/password', { currentPassword: 'password123', newPassword: 'password123' });
    expect(j(same).error.code).toBe('password_unchanged');
    const short = await post(a, '/api/v1/auth/password', { currentPassword: 'password123', newPassword: 'short' });
    expect(j(short).error.details[0].path).toEqual(['newPassword']);
    const ok = await post(a, '/api/v1/auth/password', { currentPassword: 'password123', newPassword: 'new-password-456' });
    expect(ok.statusCode).toBe(200); expect(j(ok).otherSessionsRevoked).toBe(true);
    const a2 = { cookies: { vpb_session: cookieOf(ok).value } };                     // re-issued cookie for this device
    expect((await get(a2, '/api/v1/projects')).statusCode).toBe(200);
    expect((await get(a, '/api/v1/projects')).statusCode).toBe(401);                // old token of this device is revoked as well
    expect((await get(b, '/api/v1/projects')).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'pw@example.com', password: 'password123' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'pw@example.com', password: 'new-password-456' } })).statusCode).toBe(200);
  });
  it('tokens issued before the upgrade (no tv claim) stay valid until the first revocation', async () => {
    const s = await session(app, 'legacy@example.com');
    const legacy = app.jwt.sign({ sub: s.user.id, role: s.user.role });              // pre-002 token shape
    const L = { cookies: { vpb_session: legacy } };
    expect((await get(L, '/api/v1/projects')).statusCode).toBe(200);
    await post(s, '/api/v1/auth/logout-all');
    expect((await get(L, '/api/v1/projects')).statusCode).toBe(401);
  });
  it('a bumped token_version in the database (e.g. by an admin action) takes effect on the next request', async () => {
    const s = await session(app, 'db@example.com');
    const db = new pg.Client({ connectionString: TEST_DB }); await db.connect();
    await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [s.user.id]); await db.end();
    expect((await get(s, '/api/v1/auth/me')).statusCode).toBe(401);
  });
});
