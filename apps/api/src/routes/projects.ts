import type { FastifyInstance } from 'fastify';
import * as core from '@vpb/core';
import { z, parse, Uuid } from '../lib/validate.js';
import { AppError, notFound } from '../lib/errors.js';
import { SpecSchema } from './meta.js';

const projOut = (p: any) => ({ id: p.id, name: p.name, model: p.target_model, spec: p.spec, createdAt: p.created_at, updatedAt: p.updated_at, versions: p.versions !== undefined ? Number(p.versions) : undefined });
const verOut = (v: any) => ({ id: v.id, projectId: v.project_id, no: v.version_no, title: v.title, model: v.target_model, spec: v.spec, prompt: v.compiled_prompt, negative: v.compiled_negative, enhanced: v.enhanced, score: v.score, createdAt: v.created_at });
const clean = (spec: any): Record<string, any> => { const s = core.normalizeSpec(spec); return { ...s, enhanced: spec?.enhanced && typeof spec.enhanced === 'object' ? spec.enhanced : null }; };

export default async function projectRoutes(app: FastifyInstance) {
  const { db } = app;
  const auth = { preHandler: app.authenticate };
  const own = async (id: string, uid: string) => {
    const r = await db.query('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [parse(Uuid, id), uid]);
    if (!r.rowCount) throw notFound('project');
    return r.rows[0];
  };

  app.get('/projects', auth, async req => {
    const r = await db.query(`SELECT p.*, (SELECT count(*) FROM prompt_versions v WHERE v.project_id = p.id) AS versions
      FROM projects p WHERE p.user_id = $1 ORDER BY p.updated_at DESC LIMIT 200`, [req.uid]);
    return { projects: r.rows.map(projOut) };
  });
  app.post('/projects', auth, async (req, reply) => {
    const b = parse(z.object({ name: z.string().trim().min(1).max(120), spec: SpecSchema.optional() }), req.body);
    const n = Number((await db.query('SELECT count(*)::int n FROM projects WHERE user_id = $1', [req.uid])).rows[0].n);
    if (n >= 500) throw new AppError(400, 'limit_reached', 'มีโปรเจกต์ได้สูงสุด 500 รายการ');
    const spec = clean(b.spec || {});
    const r = await db.query('INSERT INTO projects (user_id, name, target_model, spec) VALUES ($1, $2, $3, $4) RETURNING *', [req.uid, b.name, spec.model, JSON.stringify(spec)]);
    await app.llm.log(req.uid!, 'project.create', { name: b.name }, r.rows[0].id);
    return reply.status(201).send({ project: projOut(r.rows[0]) });
  });
  app.get('/projects/:id', auth, async req => ({ project: projOut(await own((req.params as any).id, req.uid!)) }));
  app.patch('/projects/:id', auth, async req => {
    const p = await own((req.params as any).id, req.uid!);
    const b = parse(z.object({ name: z.string().trim().min(1).max(120).optional(), spec: SpecSchema.optional() }), req.body);
    const spec = b.spec ? clean(b.spec) : p.spec;
    const r = await db.query('UPDATE projects SET name = $2, spec = $3, target_model = $4, updated_at = now() WHERE id = $1 RETURNING *', [p.id, b.name ?? p.name, JSON.stringify(spec), spec.model || p.target_model]);
    return { project: projOut(r.rows[0]) };
  });
  app.delete('/projects/:id', auth, async req => {
    const p = await own((req.params as any).id, req.uid!);
    await db.query('DELETE FROM projects WHERE id = $1', [p.id]);
    await app.llm.log(req.uid!, 'project.delete', { name: p.name });
    return { ok: true };
  });

  app.get('/projects/:id/versions', auth, async req => {
    const p = await own((req.params as any).id, req.uid!);
    const r = await db.query('SELECT * FROM prompt_versions WHERE project_id = $1 ORDER BY version_no DESC LIMIT 100', [p.id]);
    return { versions: r.rows.map(verOut) };
  });
  // Server re-compiles the spec (source of truth); an AI-enhanced prompt is accepted only if it was made from the same compiled source.
  app.post('/projects/:id/versions', auth, async (req, reply) => {
    const p = await own((req.params as any).id, req.uid!);
    const b = parse(z.object({ title: z.string().trim().max(160).optional(), spec: SpecSchema.optional(),
      enhanced: z.object({ prompt: z.string().min(1).max(8000), negative: z.string().max(4000).default(''), source: z.string().max(12000) }).nullish() }), req.body);
    const spec = clean(b.spec || p.spec);
    const a = await app.llm.analyze(spec, spec.model);
    if (!a.prompt) throw new AppError(400, 'empty_spec', 'ยังไม่มี prompt ให้บันทึก');
    const enh = b.enhanced && b.enhanced.source === a.prompt ? b.enhanced : null;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [p.id]);
      const no = Number((await client.query('SELECT coalesce(max(version_no), 0) + 1 AS n FROM prompt_versions WHERE project_id = $1', [p.id])).rows[0].n);
      const v = (await client.query(`INSERT INTO prompt_versions (project_id, user_id, version_no, title, target_model, spec, compiled_prompt, compiled_negative, enhanced, score)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [p.id, req.uid, no, b.title || (spec.subject || spec.idea || p.name).slice(0, 160), a.model, JSON.stringify(spec), enh ? enh.prompt : a.prompt, enh ? (enh.negative || a.negative) : a.negative, !!enh, a.score])).rows[0];
      await client.query('UPDATE projects SET spec = $2, target_model = $3, updated_at = now() WHERE id = $1', [p.id, JSON.stringify(spec), a.model]);
      await client.query('COMMIT');
      await app.llm.log(req.uid!, 'version.save', { no, model: a.model, score: a.score, enhanced: !!enh }, p.id);
      return reply.status(201).send({ version: verOut(v) });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  app.get('/versions/:id', auth, async req => {
    const r = await db.query('SELECT * FROM prompt_versions WHERE id = $1 AND user_id = $2', [parse(Uuid, (req.params as any).id), req.uid]);
    if (!r.rowCount) throw notFound('version');
    return { version: verOut(r.rows[0]) };
  });
}
