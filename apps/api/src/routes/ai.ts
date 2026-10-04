import type { FastifyInstance } from 'fastify';
import * as core from '@vpb/core';
import { z, parse } from '../lib/validate.js';
import { PROVIDER_IDS, isProviderId, type ProviderId } from '../llm/providers.js';
import { TASKS, type AISettings } from '../llm/service.js';
import { SpecSchema } from './meta.js';

const Pid = z.string().refine(isProviderId, 'unknown provider') as unknown as z.ZodType<ProviderId>;
const Url = z.string().trim().max(300).refine(u => u === '' || /^https?:\/\/[^\s]+$/i.test(u), 'must be an http(s) URL');
const Prefs = z.object({
  baseUrl: Url.optional(), model: z.string().trim().max(120).optional(),
  temperature: z.union([z.number().min(0).max(2), z.null(), z.literal('')]).optional().transform(v => (v === '' ? null : v)),
  maxTokens: z.coerce.number().int().min(16).max(32000).optional(),
  apiKey: z.string().max(400).nullable().optional(),       // string = set, null = delete, undefined = keep
});
const TaskRoute = z.object({ provider: z.string().refine(v => v === 'default' || v === 'offline' || isProviderId(v), 'bad provider'), model: z.string().trim().max(120).default('') });
const Settings = z.object({
  defaultProvider: z.string().refine(v => v === '' || isProviderId(v), 'bad provider').default(''),
  tasks: z.object({ enhance: TaskRoute, translate: TaskRoute, parse: TaskRoute }).partial().default({}),
  autoTranslate: z.boolean().default(true),
  providers: z.record(Prefs).default({}),
});

export default async function aiRoutes(app: FastifyInstance) {
  const { llm, cfg } = app;
  const auth = { preHandler: app.authenticate };
  const llmCfg = { preHandler: app.authenticate, config: { rateLimit: { max: cfg.LLM_RATE_PER_MIN, timeWindow: '1 minute', keyGenerator: (req: any) => 'llm:' + (req.uid || req.ip) } } };

  app.get('/ai/settings', auth, async req => ({ ...(await llm.status(req.uid!)), quota: await llm.quota(req.uid!) }));
  app.put('/ai/settings', auth, async req => {
    const b = parse(Settings, req.body);
    const cur = await llm.getSettings(req.uid!);
    const next: AISettings = { ...cur, defaultProvider: b.defaultProvider as AISettings['defaultProvider'], autoTranslate: b.autoTranslate };
    for (const t of TASKS) if (b.tasks[t]) next.tasks[t] = b.tasks[t] as AISettings['tasks'][typeof t];
    const allowBase = await llm.canSetBaseUrl(req.uid!);
    for (const [id, p] of Object.entries(b.providers)) {
      if (!isProviderId(id)) continue;
      const { apiKey, ...prefs } = p;
      if (!allowBase) delete prefs.baseUrl;                         // policy: only env base URLs
      else if (prefs.baseUrl) await llm.checkBaseUrl(prefs.baseUrl); // SSRF guard at save time (and again at call time)
      next.providers[id] = { ...(cur.providers[id] || {}), ...Object.fromEntries(Object.entries(prefs).filter(([, v]) => v !== undefined)) };
      if (apiKey !== undefined) await llm.setKey(req.uid!, id, apiKey);
    }
    await llm.saveSettings(req.uid!, next);
    await llm.log(req.uid!, 'ai.settings', { defaultProvider: next.defaultProvider });
    return { ...(await llm.status(req.uid!)), quota: await llm.quota(req.uid!) };
  });
  app.delete('/ai/keys', auth, async req => ({ deleted: await llm.clearKeys(req.uid!) }));

  app.post('/ai/test', llmCfg, async req => {
    const b = parse(z.object({ provider: Pid, draft: Prefs.omit({ apiKey: true }).extend({ apiKey: z.string().max(400).optional() }).optional() }), req.body);
    const d = b.draft ? Object.fromEntries(Object.entries(b.draft).filter(([, v]) => v !== undefined && v !== '')) : undefined;
    return llm.testConnection(req.uid!, b.provider, d as any);
  });
  app.post('/ai/translate', llmCfg, async req => {
    const b = parse(z.object({ texts: z.array(z.string().max(2000)).min(1).max(50) }), req.body);
    return llm.translate(req.uid!, b.texts);
  });
  app.post('/ai/parse-idea', llmCfg, async req => {
    const b = parse(z.object({ idea: z.string().trim().min(2).max(2000), model: z.string().refine(m => !!core.MOD[m]).optional() }), req.body);
    return llm.parseIdea(req.uid!, b.idea, b.model);
  });
  app.post('/ai/enhance', llmCfg, async req => {
    const b = parse(z.object({ spec: SpecSchema, model: z.string().refine(m => !!core.MOD[m]).optional(), projectId: z.string().uuid().optional() }), req.body);
    return llm.enhance(req.uid!, b.spec, b.model, b.projectId);
  });
  app.post('/llm', llmCfg, async req => {
    const b = parse(z.object({
      task: z.enum(['enhance', 'translate', 'parse']).optional(), provider: Pid.optional(), model: z.string().max(120).optional(),
      system: z.string().max(20000).optional(), json: z.boolean().optional(), temperature: z.number().min(0).max(2).nullable().optional(),
      max_tokens: z.number().int().min(16).max(32000).optional(),
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(40000) })).min(1).max(40),
    }), req.body);
    return llm.generic(req.uid!, req.role === 'admin', b);
  });
  app.get('/ai/providers', async () => ({ providers: PROVIDER_IDS }));
}
