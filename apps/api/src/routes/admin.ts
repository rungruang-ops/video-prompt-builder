import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z, parse, Uuid } from '../lib/validate.js';
import { AppError, forbidden, notFound } from '../lib/errors.js';
import { revokeSessions, setSessionCookie } from '../lib/sessions.js';

/** history kinds that are LLM calls (counted as "AI usage") */
const AI_KINDS = ['ai.test', 'ai.translate', 'ai.parse', 'ai.enhance', 'ai.llm'];
// same lock id family as registration (7240001): serializes "is there still another active admin?" decisions
const ADMIN_LOCK = 7240002;

const ListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(['admin', 'user']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
const Patch = z.object({ role: z.enum(['admin', 'user']).optional(), disabled: z.boolean().optional() })
  .refine(b => b.role !== undefined || b.disabled !== undefined, 'ต้องระบุ role หรือ disabled อย่างน้อยหนึ่งอย่าง');

const likeEscape = (s: string) => s.toLowerCase().replace(/[\\%_]/g, m => '\\' + m);

const USER_COLS = `u.id, u.email, u.display_name, u.role, u.created_at, u.last_login_at, u.disabled_at,
  (SELECT count(*)::int FROM projects p WHERE p.user_id = u.id) AS projects,
  (SELECT count(*)::int FROM prompt_versions v WHERE v.user_id = u.id) AS versions,
  (SELECT count(*)::int FROM history h WHERE h.user_id = u.id AND h.kind = ANY($1::text[]) AND h.created_at > now() - interval '7 days') AS ai_calls_7d`;

export default async function adminRoutes(app: FastifyInstance) {
  const { db, cfg } = app;
  const requireAdmin = async (req: FastifyRequest) => {
    await app.authenticate(req);                       // also re-reads the role from the database
    if (req.role !== 'admin') throw forbidden('สำหรับผู้ดูแลระบบ (admin) เท่านั้น');
  };
  const out = async (u: any, me: string) => ({
    id: u.id, email: u.email, displayName: u.display_name, role: u.role, createdAt: u.created_at, lastLoginAt: u.last_login_at,
    disabled: !!u.disabled_at, disabledAt: u.disabled_at, isSelf: u.id === me,
    projects: u.projects, versions: u.versions, aiCalls7d: u.ai_calls_7d, quota: await app.llm.quota(u.id),
  });
  const stats = async () => (await db.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE role = 'admin' AND disabled_at IS NULL)::int AS admins,
      count(*) FILTER (WHERE disabled_at IS NOT NULL)::int AS disabled FROM users`)).rows[0];
  const loadOne = async (id: string) => (await db.query(`SELECT ${USER_COLS} FROM users u WHERE u.id = $2`, [AI_KINDS, id])).rows[0];

  app.get('/admin/users', { preHandler: requireAdmin }, async req => {
    const q = parse(ListQuery, req.query);
    // $2..$4 are shared by the page query and the count query
    const where = `($2::text IS NULL OR lower(u.email) LIKE $2 ESCAPE '\\' OR lower(coalesce(u.display_name, '')) LIKE $2 ESCAPE '\\')
        AND ($3::text IS NULL OR u.role = $3)
        AND ($4::text IS NULL OR (u.disabled_at IS NOT NULL) = ($4 = 'disabled'))`;
    const filters = [q.q ? `%${likeEscape(q.q)}%` : null, q.role ?? null, q.status ?? null];
    const [page, count] = await Promise.all([
      db.query(`SELECT ${USER_COLS} FROM users u WHERE ${where} ORDER BY u.created_at, u.id LIMIT $5 OFFSET $6`, [AI_KINDS, ...filters, q.limit, q.offset]),
      db.query(`SELECT count(*)::int AS n FROM users u WHERE $1::text[] IS NOT NULL AND ${where}`, [AI_KINDS, ...filters]),
    ]);
    return {
      users: await Promise.all(page.rows.map(u => out(u, req.uid!))),
      total: count.rows[0].n, limit: q.limit, offset: q.offset, stats: await stats(), dailyQuota: cfg.LLM_DAILY_QUOTA,
    };
  });

  app.get('/admin/users/:id', { preHandler: requireAdmin }, async req => {
    const u = await loadOne(parse(Uuid, (req.params as any).id));
    if (!u) throw notFound('user');
    const recent = (await db.query(`SELECT kind, detail, created_at FROM history WHERE user_id = $1 ORDER BY id DESC LIMIT 20`, [u.id])).rows;
    return { user: await out(u, req.uid!), recent };
  });

  app.patch('/admin/users/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const id = parse(Uuid, (req.params as any).id);
    const b = parse(Patch, req.body);
    if (id === req.uid && b.disabled === true) throw new AppError(400, 'cannot_disable_self', 'ระงับบัญชีของตัวเองไม่ได้');
    const client = await db.connect();
    let changes: Record<string, unknown> = {}, target: any;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_LOCK]);
      target = (await client.query('SELECT id, email, role, disabled_at FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!target) throw notFound('user');
      const nextRole = b.role ?? target.role, nextDisabled = b.disabled ?? !!target.disabled_at;
      const losesAdmin = target.role === 'admin' && !target.disabled_at && (nextRole !== 'admin' || nextDisabled);
      if (losesAdmin) {
        const others = Number((await client.query(`SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL AND id <> $1`, [id])).rows[0].n);
        if (others === 0) throw new AppError(409, 'last_admin', 'ต้องมี admin ที่ใช้งานได้อย่างน้อย 1 คน — แต่งตั้ง admin คนอื่นก่อน');
      }
      if (nextRole !== target.role) { await client.query('UPDATE users SET role = $2 WHERE id = $1', [id, nextRole]); changes.role = nextRole; }
      if (nextDisabled !== !!target.disabled_at) {
        await client.query(nextDisabled ? 'UPDATE users SET disabled_at = now(), disabled_by = $2 WHERE id = $1' : 'UPDATE users SET disabled_at = NULL, disabled_by = NULL WHERE id = $1',
          nextDisabled ? [id, req.uid] : [id]);
        changes.disabled = nextDisabled;
      }
      // role change or disable → every session of that user stops working right away
      if (changes.role !== undefined || changes.disabled === true) changes.sessionsRevoked = (await revokeSessions(client, id)) !== null;
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { client.release(); }
    if (Object.keys(changes).length) await app.llm.log(req.uid!, 'admin.user_update', { target: id, email: target.email, ...changes });
    // an admin changing their own role keeps this device signed in (with the new role); other devices are revoked
    if (id === req.uid && changes.sessionsRevoked) {
      await setSessionCookie(reply, cfg, (await db.query('SELECT id, role, token_version FROM users WHERE id = $1', [id])).rows[0]);
    }
    return { user: await out(await loadOne(id), req.uid!), changes, stats: await stats() };
  });
}
