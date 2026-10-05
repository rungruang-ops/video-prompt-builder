import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { makeApp, resetDb, session, TEST_DB } from '../helpers.js';

let app: any;
let admin: any;                       // first registered user = admin
const j = (r: any) => r.json();
const inj = (s: any, method: string, url: string, payload?: any) => app.inject({ method, url, payload, cookies: s?.cookies });
const patch = (s: any, id: string, payload: any) => inj(s, 'PATCH', `/api/v1/admin/users/${id}`, payload);
const list = async (s: any, qs = '') => j(await inj(s, 'GET', `/api/v1/admin/users${qs}`));
const login = (email: string, password = 'password123') => app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });

beforeAll(async () => {
  await resetDb();
  ({ app } = await makeApp({ AUTH_RATE_PER_MIN: 1000, LLM_DAILY_QUOTA: 50 }));
  admin = await session(app, 'boss@example.com');
});
afterAll(async () => { await app?.close(); });

describe('admin user management: access', () => {
  it('is admin-only (401 anonymous, 403 for normal users)', async () => {
    const u = await session(app, 'plain@example.com');
    expect(u.user.role).toBe('user'); expect(admin.user.role).toBe('admin');
    expect((await inj(null, 'GET', '/api/v1/admin/users')).statusCode).toBe(401);
    const r = await inj(u, 'GET', '/api/v1/admin/users');
    expect(r.statusCode).toBe(403); expect(j(r).error.code).toBe('forbidden');
    expect((await patch(u, admin.user.id, { role: 'user' })).statusCode).toBe(403);
    expect((await inj(u, 'GET', `/api/v1/admin/users/${admin.user.id}`)).statusCode).toBe(403);
    expect((await inj(admin, 'GET', '/api/v1/admin/users')).statusCode).toBe(200);
  });
  it('validates ids and bodies', async () => {
    expect((await patch(admin, 'not-a-uuid', { role: 'user' })).statusCode).toBe(400);
    expect((await patch(admin, '00000000-0000-4000-8000-000000000000', { role: 'user' })).statusCode).toBe(404);
    const u = await session(app, 'plain@example.com');
    const empty = await patch(admin, u.user.id, {});
    expect(empty.statusCode).toBe(400); expect(j(empty).error.code).toBe('validation_error');
    expect((await patch(admin, u.user.id, { role: 'root' })).statusCode).toBe(400);
    expect((await inj(admin, 'GET', '/api/v1/admin/users?limit=1000')).statusCode).toBe(400);
  });
});

describe('admin user management: listing', () => {
  it('lists users with project counts, quota usage and AI calls; search, filters and paging', async () => {
    const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: 'Maew.Som@Example.com', password: 'password123', displayName: 'แมวส้ม 100%' } });
    expect(reg.statusCode).toBe(201);
    const m = await session(app, 'maew.som@example.com');
    for (const name of ['p1', 'p2']) expect((await inj(m, 'POST', '/api/v1/projects', { name })).statusCode).toBe(201);
    await inj(m, 'PUT', '/api/v1/ai/settings', { defaultProvider: 'custom', providers: { custom: { baseUrl: 'http://stub.local/v1', model: 'm' } } });
    for (let i = 0; i < 3; i++) expect((await inj(m, 'POST', '/api/v1/ai/test', { provider: 'custom' })).statusCode).toBe(200);

    const all = await list(admin);
    expect(all.total).toBeGreaterThanOrEqual(3);
    expect(all.stats).toMatchObject({ admins: 1, disabled: 0 }); expect(all.stats.total).toBe(all.total);
    const row = all.users.find((u: any) => u.email === 'maew.som@example.com');
    expect(row).toMatchObject({ role: 'user', disabled: false, isSelf: false, projects: 2, aiCalls7d: 3, quota: { used: 3, limit: 50, remaining: 47 } });
    expect(row).not.toHaveProperty('password_hash'); expect(row).not.toHaveProperty('passwordHash');
    expect(all.users.find((u: any) => u.isSelf).email).toBe('boss@example.com');

    expect((await list(admin, '?q=MAEW')).users.map((u: any) => u.email)).toEqual(['maew.som@example.com']);   // case-insensitive
    expect((await list(admin, '?q=nobody-here')).total).toBe(0);
    expect((await list(admin, '?q=' + encodeURIComponent('แมวส้ม'))).users.map((u: any) => u.email)).toEqual(['maew.som@example.com']);  // display name
    expect((await list(admin, '?q=%25')).users.map((u: any) => u.email)).toEqual(['maew.som@example.com']);   // LIKE wildcards are literal
    expect((await list(admin, '?q=_')).total).toBe(0);
    expect((await list(admin, '?role=admin')).users.map((u: any) => u.email)).toEqual(['boss@example.com']);
    expect((await list(admin, '?status=disabled')).total).toBe(0);

    const p1 = await list(admin, '?limit=1&offset=0'), p2 = await list(admin, '?limit=1&offset=1');
    expect(p1.users).toHaveLength(1); expect(p2.users).toHaveLength(1); expect(p1.users[0].id).not.toBe(p2.users[0].id);
    expect(p1.total).toBe(all.total);
    expect((await list(admin, '?offset=500')).users).toHaveLength(0);
    expect((await list(admin, '?offset=500')).total).toBe(all.total);

    const one = j(await inj(admin, 'GET', `/api/v1/admin/users/${row.id}`));
    expect(one.user.projects).toBe(2); expect(one.recent.some((h: any) => h.kind === 'ai.test')).toBe(true);
  });
});

describe('admin user management: disable / enable', () => {
  it('a disabled user cannot log in and their open sessions stop working; enabling restores login', async () => {
    const laptop = await session(app, 'victim@example.com'); const phone = await session(app, 'victim@example.com');
    const id = laptop.user.id;
    const r = await patch(admin, id, { disabled: true });
    expect(r.statusCode).toBe(200);
    expect(j(r).user).toMatchObject({ disabled: true }); expect(j(r).changes).toMatchObject({ disabled: true, sessionsRevoked: true });
    expect(j(r).stats.disabled).toBe(1);
    for (const s of [laptop, phone]) {
      const x = await inj(s, 'GET', '/api/v1/projects'); expect(x.statusCode).toBe(401);
      expect(j(await inj(s, 'GET', '/api/v1/auth/session')).user).toBeNull();
    }
    const bad = await login('victim@example.com', 'wrong-password');
    expect(bad.statusCode).toBe(401); expect(j(bad).error.code).toBe('invalid_credentials');   // no disabled-state leak without the password
    const denied = await login('victim@example.com');
    expect(denied.statusCode).toBe(403); expect(j(denied).error.code).toBe('account_disabled');
    expect(denied.cookies.find((c: any) => c.name === 'vpb_session')).toBeUndefined();
    expect((await list(admin, '?status=disabled')).users.map((u: any) => u.email)).toEqual(['victim@example.com']);

    // even a token that somehow still carries the current version is refused while disabled
    const c = new pg.Client({ connectionString: TEST_DB }); await c.connect();
    const { rows: [u] } = await c.query('SELECT disabled_by, token_version FROM users WHERE id = $1', [id]); await c.end();
    expect(u.disabled_by).toBe(admin.user.id);
    const forged = { cookies: { vpb_session: app.jwt.sign({ sub: id, role: 'user', tv: u.token_version }) } };
    const fx = await inj(forged, 'GET', '/api/v1/projects');
    expect(fx.statusCode).toBe(401); expect(j(fx).error.code).toBe('account_disabled');

    const en = await patch(admin, id, { disabled: false });
    expect(en.statusCode).toBe(200); expect(j(en).user.disabled).toBe(false);
    expect((await login('victim@example.com')).statusCode).toBe(200);
    expect((await inj(laptop, 'GET', '/api/v1/projects')).statusCode).toBe(401);           // old sessions stay revoked
    const hist = j(await inj(admin, 'GET', '/api/v1/history?limit=20')).history;
    expect(hist.filter((h: any) => h.kind === 'admin.user_update').map((h: any) => h.detail)).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: id, email: 'victim@example.com', disabled: true }), expect.objectContaining({ target: id, disabled: false })]));
  });
  it('cannot disable yourself', async () => {
    const r = await patch(admin, admin.user.id, { disabled: true });
    expect(r.statusCode).toBe(400); expect(j(r).error.code).toBe('cannot_disable_self');
    expect((await inj(admin, 'GET', '/api/v1/admin/users')).statusCode).toBe(200);
  });
});

describe('admin user management: roles and the last-admin guard', () => {
  it('role changes take effect immediately and revoke the user\'s sessions', async () => {
    const s = await session(app, 'promote@example.com');
    const r = await patch(admin, s.user.id, { role: 'admin' });
    expect(r.statusCode).toBe(200); expect(j(r).user.role).toBe('admin'); expect(j(r).changes).toMatchObject({ role: 'admin', sessionsRevoked: true });
    const old = await inj(s, 'GET', '/api/v1/projects');
    expect(old.statusCode).toBe(401); expect(j(old).error.code).toBe('session_revoked');
    const fresh = await session(app, 'promote@example.com');
    expect(fresh.user.role).toBe('admin');
    expect((await inj(fresh, 'GET', '/api/v1/admin/users')).statusCode).toBe(200);
    expect(j(await patch(admin, s.user.id, { role: 'user' })).user.role).toBe('user');
    expect((await inj(fresh, 'GET', '/api/v1/admin/users')).statusCode).toBe(401);           // demoted → revoked
    const again = await session(app, 'promote@example.com');
    expect((await inj(again, 'GET', '/api/v1/admin/users')).statusCode).toBe(403);
  });
  it('a no-op patch changes nothing and keeps sessions', async () => {
    const s = await session(app, 'noop@example.com');
    const r = await patch(admin, s.user.id, { role: 'user', disabled: false });
    expect(r.statusCode).toBe(200); expect(j(r).changes).toEqual({});
    expect((await inj(s, 'GET', '/api/v1/projects')).statusCode).toBe(200);
  });
  it('the last active admin cannot be demoted', async () => {
    const r = await patch(admin, admin.user.id, { role: 'user' });
    expect(r.statusCode).toBe(409); expect(j(r).error.code).toBe('last_admin');
    expect((await list(admin, '?role=admin')).total).toBe(1);
  });
  it('a disabled admin does not count; with two active admins one may step down (keeping this device signed in)', async () => {
    const b = await session(app, 'second-admin@example.com');
    await patch(admin, b.user.id, { role: 'admin' });
    const b2 = await session(app, 'second-admin@example.com');
    // disable B: allowed (A is still an active admin) → now A is the only *active* admin
    expect((await patch(admin, b.user.id, { disabled: true })).statusCode).toBe(200);
    expect((await patch(admin, admin.user.id, { role: 'user' })).statusCode).toBe(409);
    expect((await patch(admin, b.user.id, { disabled: false })).statusCode).toBe(200);
    const b3 = await session(app, 'second-admin@example.com');
    expect((await inj(b2, 'GET', '/api/v1/projects')).statusCode).toBe(401);
    // B demotes themself: their current device gets a fresh cookie with the new role
    const self = await patch(b3, b.user.id, { role: 'user' });
    expect(self.statusCode).toBe(200); expect(j(self).user).toMatchObject({ role: 'user', isSelf: true });
    const ck = self.cookies.find((c: any) => c.name === 'vpb_session'); expect(ck?.value).toBeTruthy();
    const kept = { cookies: { vpb_session: ck.value } };
    expect(j(await inj(kept, 'GET', '/api/v1/auth/me')).user.role).toBe('user');
    expect((await inj(kept, 'GET', '/api/v1/admin/users')).statusCode).toBe(403);
    expect((await inj(b3, 'GET', '/api/v1/projects')).statusCode).toBe(401);
  });
  it('concurrent demotions of the last two admins: exactly one succeeds', async () => {
    const b = await session(app, 'race@example.com');
    await patch(admin, b.user.id, { role: 'admin' });
    const bs = await session(app, 'race@example.com');
    const [x, y] = await Promise.all([patch(admin, admin.user.id, { role: 'user' }), patch(bs, b.user.id, { role: 'user' })]);
    expect([x.statusCode, y.statusCode].sort()).toEqual([200, 409]);
    expect((await list(x.statusCode === 200 ? bs : admin, '?role=admin&status=active')).total).toBe(1);
  });
});
