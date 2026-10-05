import { clientIp } from '../lib/clientip.js';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z, parse } from '../lib/validate.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { revokeSessions, setSessionCookie, tokenIsCurrent } from '../lib/sessions.js';

// trim/lowercase first, then validate the normalized value (zod 4: z.email() is a top-level format)
const Email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const Register = z.object({ email: Email, password: z.string().min(8, 'ต้องยาวอย่างน้อย 8 ตัวอักษร').max(128), displayName: z.string().trim().max(80).optional() });
const Login = z.object({ email: Email, password: z.string().min(1).max(128) });
const ChangePassword = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(8, 'ต้องยาวอย่างน้อย 8 ตัวอักษร').max(128) });
const pub = (u: any) => ({ id: u.id, email: u.email, displayName: u.display_name, role: u.role, createdAt: u.created_at });
// constant dummy hash so unknown emails take as long as wrong passwords (no user enumeration by timing)
let dummy = '';

export default async function authRoutes(app: FastifyInstance) {
  const { db, cfg } = app;
  const authLimit = { rateLimit: { max: cfg.AUTH_RATE_PER_MIN, timeWindow: '1 minute', keyGenerator: (req: any) => 'auth:' + clientIp(req) } };
  const setSession = (reply: FastifyReply, u: any) => setSessionCookie(reply, cfg, u);
  const clearSession = (reply: FastifyReply) => reply.clearCookie(cfg.COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax', secure: cfg.COOKIE_SECURE });

  app.post('/register', { config: authLimit }, async (req, reply) => {
    const b = parse(Register, req.body);
    const hash = await hashPassword(b.password);          // slow part outside the lock
    const client = await db.connect();
    let u: any, role: 'admin' | 'user';
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(7240001)');   // serialize: exactly one "first user = admin"
      const count = Number((await client.query('SELECT count(*)::int AS n FROM users')).rows[0].n);
      if (count > 0 && !cfg.REGISTRATION_OPEN) throw new AppError(403, 'registration_closed', 'ปิดรับสมัครสมาชิกใหม่ — ติดต่อผู้ดูแลระบบ');
      role = count === 0 ? 'admin' : 'user';   // first user becomes admin
      u = (await client.query('INSERT INTO users (email, password_hash, display_name, role, last_login_at) VALUES ($1, $2, $3, $4, now()) RETURNING *',
        [b.email, hash, b.displayName || b.email.split('@')[0], role])).rows[0];
      await client.query('COMMIT');
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.code === '23505') throw new AppError(409, 'email_taken', 'อีเมลนี้มีบัญชีอยู่แล้ว');
      throw e;
    } finally { client.release(); }
    await setSession(reply, u);
    await app.llm.log(u.id, 'auth.register', { role });
    return reply.status(201).send({ user: pub(u) });
  });

  app.post('/login', { config: authLimit }, async (req, reply) => {
    const b = parse(Login, req.body);
    const u = (await db.query('SELECT * FROM users WHERE lower(email) = $1', [b.email])).rows[0];
    if (!dummy) dummy = await hashPassword('dummy-password-for-timing');
    const ok = await verifyPassword(b.password, u ? u.password_hash : dummy);
    if (!u || !ok) throw new AppError(401, 'invalid_credentials', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    // checked only after the password, so the disabled state is not revealed to someone without the password
    if (u.disabled_at) throw new AppError(403, 'account_disabled', 'บัญชีนี้ถูกระงับ — ติดต่อผู้ดูแลระบบ');
    await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
    await setSession(reply, u);
    await app.llm.log(u.id, 'auth.login', {});
    return { user: pub(u) };
  });

  // this device only (the JWT itself stays valid until it expires unless sessions are revoked)
  app.post('/logout', async (_req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  // log out of all devices: bump token_version so every issued JWT (including this one) stops working
  app.post('/logout-all', { preHandler: app.authenticate }, async (req, reply) => {
    await revokeSessions(db, req.uid!);
    clearSession(reply);
    await app.llm.log(req.uid!, 'auth.logout_all', {});
    return { ok: true };
  });

  // change password: verify the current one, then revoke all other sessions and re-issue this device's cookie
  app.post('/password', { preHandler: app.authenticate, config: authLimit }, async (req, reply) => {
    const b = parse(ChangePassword, req.body);
    const u = (await db.query('SELECT * FROM users WHERE id = $1', [req.uid])).rows[0];
    if (!(await verifyPassword(b.currentPassword, u.password_hash))) throw new AppError(400, 'invalid_current_password', 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
    if (b.newPassword === b.currentPassword) throw new AppError(400, 'password_unchanged', 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
    await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [u.id, await hashPassword(b.newPassword)]);
    const tv = await revokeSessions(db, u.id);
    await setSession(reply, { ...u, token_version: tv });
    await app.llm.log(u.id, 'auth.password_change', {});
    return { ok: true, otherSessionsRevoked: true };
  });

  app.get('/me', { preHandler: app.authenticate }, async req => {
    const u = (await db.query('SELECT * FROM users WHERE id = $1', [req.uid])).rows[0];
    return { user: pub(u), quota: await app.llm.quota(req.uid!) };
  });

  // Non-failing session probe for the SPA (avoids a 401 on first load)
  app.get('/session', async (req, reply) => {
    const count = Number((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n);
    const config = { registrationOpen: count === 0 || cfg.REGISTRATION_OPEN, firstUser: count === 0 };
    if (!req.uid) return { user: null, config };
    const u = (await db.query('SELECT * FROM users WHERE id = $1', [req.uid])).rows[0];
    if (!u || u.disabled_at || !tokenIsCurrent(req.tv, u.token_version)) { clearSession(reply); return { user: null, config }; }   // deleted/disabled user, revoked session
    return { user: pub(u), config };
  });

  app.get('/config', async () => {
    const count = Number((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n);
    return { registrationOpen: count === 0 || cfg.REGISTRATION_OPEN, firstUser: count === 0 };
  });
}
