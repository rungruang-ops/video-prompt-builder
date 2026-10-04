import type { FastifyInstance } from 'fastify';
import * as core from '@vpb/core';
import { z, parse, Uuid } from '../lib/validate.js';
import { AppError, notFound } from '../lib/errors.js';

export const SpecSchema = z.record(z.any()).refine(s => JSON.stringify(s).length < 200_000, 'spec too large');
const ModelId = z.string().refine(m => !!core.MOD[m], 'unknown model');
const presetOut = (p: any) => ({ id: p.slug || p.id, dbId: p.id, system: p.is_system, th: p.name_th, e: p.emoji, model: p.target_model, s: p.spec });

export default async function metaRoutes(app: FastifyInstance) {
  const { db } = app;
  const auth = { preHandler: app.authenticate };

  app.get('/taxonomy', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=300');
    return { steps: core.STEPS, groups: core.GROUPS, models: core.MODELS };
  });
  app.get('/models', async () => ({ models: core.MODELS }));

  app.get('/presets', auth, async req => {
    const r = await db.query('SELECT * FROM presets WHERE is_system OR user_id = $1 ORDER BY is_system DESC, sort_order, created_at', [req.uid]);
    return { presets: r.rows.map(presetOut) };
  });
  app.post('/presets', auth, async (req, reply) => {
    const b = parse(z.object({ name: z.string().trim().min(1).max(80), emoji: z.string().max(8).default('⭐'), model: ModelId, spec: SpecSchema }), req.body);
    const n = Number((await db.query('SELECT count(*)::int n FROM presets WHERE user_id = $1', [req.uid])).rows[0].n);
    if (n >= 100) throw new AppError(400, 'limit_reached', 'มี preset ส่วนตัวได้สูงสุด 100 รายการ');
    const spec = core.normalizeSpec(b.spec); delete (spec as any).enhanced;
    const r = await db.query('INSERT INTO presets (user_id, is_system, name_th, emoji, target_model, spec) VALUES ($1, false, $2, $3, $4, $5) RETURNING *', [req.uid, b.name, b.emoji, b.model, JSON.stringify(spec)]);
    return reply.status(201).send({ preset: presetOut(r.rows[0]) });
  });
  app.delete('/presets/:id', auth, async req => {
    const id = parse(Uuid, (req.params as any).id);
    const r = await db.query('DELETE FROM presets WHERE id = $1 AND user_id = $2 AND NOT is_system', [id, req.uid]);
    if (!r.rowCount) throw notFound('preset');
    return { ok: true };
  });

  app.post('/prompt/compile', auth, async req => {
    const b = parse(z.object({ spec: SpecSchema, model: ModelId.optional() }), req.body);
    return app.llm.analyze(b.spec, b.model);
  });

  app.get('/history', auth, async req => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), kind: z.string().max(40).optional() }), req.query);
    const r = await db.query(`SELECT h.id, h.kind, h.detail, h.created_at, h.project_id, p.name AS project_name FROM history h LEFT JOIN projects p ON p.id = h.project_id
      WHERE h.user_id = $1 AND ($2::text IS NULL OR h.kind LIKE $2 || '%') ORDER BY h.id DESC LIMIT $3`, [req.uid, q.kind ?? null, q.limit]);
    return { history: r.rows };
  });
}
