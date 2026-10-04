import { createHash } from 'node:crypto';
import * as core from '@vpb/core';
import type { Config } from '../config.js';
import type { Db } from '../db/pool.js';
import type { KV } from '../lib/kv.js';
import { AppError } from '../lib/errors.js';
import { decryptSecret, encryptSecret, keyHint } from '../lib/crypto.js';
import { PROVIDERS, PROVIDER_IDS, envProvider, isProviderId, type ProviderId } from './providers.js';
import { parseJSONLoose, type ResolvedProvider, type ChatMessage } from './adapters.js';
import { callProvider, type FetchFn, type CallResult } from './client.js';
import { assertSafeBaseUrl, type LookupFn } from '../lib/netguard.js';
import { FMT_EN, SYS_GENERIC, SYS_TEST, SYS_TRANSLATE, sysEnhance, sysParse } from './prompts.js';

export type Task = 'enhance' | 'translate' | 'parse';
export const TASKS: Task[] = ['enhance', 'translate', 'parse'];
export interface ProviderPrefs { baseUrl?: string; model?: string; temperature?: number | null; maxTokens?: number }
export interface AISettings {
  defaultProvider: '' | ProviderId;
  tasks: Record<Task, { provider: 'default' | 'offline' | ProviderId; model: string }>;
  autoTranslate: boolean;
  providers: Partial<Record<ProviderId, ProviderPrefs>>;
}
export const defaultSettings = (): AISettings => ({
  defaultProvider: '', autoTranslate: true, providers: {},
  tasks: { enhance: { provider: 'default', model: '' }, translate: { provider: 'default', model: '' }, parse: { provider: 'default', model: '' } },
});
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);

export class LLMService {
  constructor(private db: Db, private cfg: Config, private kv: KV, private fetchFn: FetchFn, private key: Buffer, private lookup?: LookupFn) {}

  /** May this user point a provider at their own base URL? (ALLOW_USER_BASE_URL = off | admin | all) */
  async canSetBaseUrl(userId: string): Promise<boolean> {
    const p = this.cfg.ALLOW_USER_BASE_URL;
    if (p === 'all') return true;
    if (p !== 'admin') return false;
    const r = await this.db.query('SELECT role FROM users WHERE id = $1', [userId]);
    return r.rows[0]?.role === 'admin';
  }
  /** SSRF guard for user-supplied URLs (env URLs are trusted). */
  async checkBaseUrl(url: string) {
    await assertSafeBaseUrl(url, { allowPrivate: this.cfg.LLM_ALLOW_PRIVATE_URLS, allowlist: this.cfg.LLM_URL_ALLOWLIST.split(',').map(h => h.trim().toLowerCase()).filter(Boolean), lookup: this.lookup });
  }

  /* ---------- settings & credentials ---------- */
  async getSettings(userId: string): Promise<AISettings> {
    const r = await this.db.query('SELECT settings FROM user_ai_settings WHERE user_id = $1', [userId]);
    const s = defaultSettings(); const j = r.rows[0]?.settings || {};
    if (isProviderId(j.defaultProvider) || j.defaultProvider === '') s.defaultProvider = j.defaultProvider;
    for (const t of TASKS) if (j.tasks?.[t]) s.tasks[t] = { provider: j.tasks[t].provider ?? 'default', model: String(j.tasks[t].model ?? '') };
    if (typeof j.autoTranslate === 'boolean') s.autoTranslate = j.autoTranslate;
    if (j.providers && typeof j.providers === 'object') for (const id of PROVIDER_IDS) if (j.providers[id]) s.providers[id] = j.providers[id];
    return s;
  }
  async saveSettings(userId: string, s: AISettings) {
    await this.db.query(`INSERT INTO user_ai_settings (user_id, settings, updated_at) VALUES ($1, $2, now())
      ON CONFLICT (user_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()`, [userId, JSON.stringify(s)]);
  }
  async setKey(userId: string, provider: ProviderId, apiKey: string | null) {
    if (apiKey === null || apiKey === '') { await this.db.query('DELETE FROM provider_credentials WHERE user_id = $1 AND provider = $2', [userId, provider]); return; }
    if (!this.cfg.ALLOW_USER_KEYS) throw new AppError(403, 'user_keys_disabled', 'ผู้ดูแลระบบปิดการใช้ API key ส่วนตัว (ALLOW_USER_KEYS=false)');
    const enc = encryptSecret(apiKey, this.key, `${userId}:${provider}`);
    await this.db.query(`INSERT INTO provider_credentials (user_id, provider, api_key_enc, key_hint) VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, provider) DO UPDATE SET api_key_enc = EXCLUDED.api_key_enc, key_hint = EXCLUDED.key_hint, updated_at = now()`, [userId, provider, enc, keyHint(apiKey)]);
  }
  async clearKeys(userId: string) { const r = await this.db.query('DELETE FROM provider_credentials WHERE user_id = $1', [userId]); return r.rowCount || 0; }
  private async userKeys(userId: string): Promise<Record<string, { key: string; hint: string }>> {
    const r = await this.db.query('SELECT provider, api_key_enc, key_hint FROM provider_credentials WHERE user_id = $1', [userId]);
    const out: Record<string, { key: string; hint: string }> = {};
    for (const row of r.rows) { try { out[row.provider] = { key: decryptSecret(row.api_key_enc, this.key, `${userId}:${row.provider}`), hint: row.key_hint }; } catch { /* undecryptable (rotated key) → ignore */ } }
    return out;
  }

  /** Resolve the effective provider config: per-user prefs + user key (encrypted) → env key → defaults. */
  resolveProvider(id: ProviderId, prefs: ProviderPrefs | undefined, userKey: string | undefined, draft?: Partial<ProviderPrefs & { apiKey: string }>, allowBase = false): ResolvedProvider & { keySource: 'user' | 'env' | 'draft' | 'none' } {
    const env = envProvider(this.cfg, id); const p = { ...(prefs || {}), ...(draft || {}) };
    const userBaseUrl = !!(allowBase && p.baseUrl && p.baseUrl !== env.baseUrl);
    const baseUrl = userBaseUrl ? String(p.baseUrl) : env.baseUrl;
    let apiKey = '', keySource: 'user' | 'env' | 'draft' | 'none' = 'none';
    if (draft?.apiKey && this.cfg.ALLOW_USER_KEYS) { apiKey = draft.apiKey; keySource = 'draft'; }
    else if (userKey && this.cfg.ALLOW_USER_KEYS) { apiKey = userKey; keySource = 'user'; }
    else if (env.apiKey && !userBaseUrl) { apiKey = env.apiKey; keySource = 'env'; }   // never send the server's key to a user-chosen URL
    const t = p.temperature; const temperature = t === null || t === undefined || (t as unknown) === '' || isNaN(Number(t)) ? null : Math.max(0, Math.min(2, Number(t)));
    const maxTokens = Math.max(16, Math.min(32000, Number(p.maxTokens) || 4096));
    return { id, baseUrl, apiKey, model: String(p.model || env.model || ''), temperature, maxTokens, keySource, userBaseUrl };
  }
  ready(r: ResolvedProvider) { return !!(r.model && r.baseUrl && (!PROVIDERS[r.id].keyRequired || r.apiKey)); }

  async route(userId: string, task: Task): Promise<ResolvedProvider | null> {
    const s = await this.getSettings(userId);
    const t = s.tasks[task];
    let pid: string = t.provider === 'default' ? (s.defaultProvider || this.cfg.DEFAULT_LLM_PROVIDER) : t.provider;
    if (!pid || pid === 'offline' || !isProviderId(pid)) return null;
    const keys = await this.userKeys(userId);
    const r = this.resolveProvider(pid, s.providers[pid], keys[pid]?.key, undefined, await this.canSetBaseUrl(userId));
    if (t.model) r.model = t.model;
    return this.ready(r) ? r : null;
  }
  /** Public status for the settings UI (never includes secrets). */
  async status(userId: string) {
    const s = await this.getSettings(userId); const keys = await this.userKeys(userId); const allowBase = await this.canSetBaseUrl(userId);
    const providers = PROVIDER_IDS.map(id => {
      const d = PROVIDERS[id]; const r = this.resolveProvider(id, s.providers[id], keys[id]?.key, undefined, allowBase); const env = envProvider(this.cfg, id);
      return { id, name: d.name, kind: d.kind, note: d.note, keyUrl: d.keyUrl, keyRequired: d.keyRequired, models: d.models,
        defaultBaseUrl: env.baseUrl, baseUrl: r.baseUrl, model: r.model, temperature: r.temperature, maxTokens: r.maxTokens,
        hasUserKey: !!keys[id], userKeyHint: keys[id]?.hint || null, hasServerKey: !!env.apiKey, keySource: r.keySource, ready: this.ready(r) };
    });
    const routes: Record<string, { provider: string; model: string } | null> = {};
    for (const t of TASKS) { const r = await this.route(userId, t); routes[t] = r ? { provider: r.id, model: r.model } : null; }
    return { settings: s, providers, routes, policy: { allowUserKeys: this.cfg.ALLOW_USER_KEYS, allowUserBaseUrl: allowBase, dailyQuota: this.cfg.LLM_DAILY_QUOTA, serverDefault: this.cfg.DEFAULT_LLM_PROVIDER || null } };
  }

  /* ---------- quota + call wrapper ---------- */
  async quota(userId: string) {
    const used = Number(await this.kv.get(`quota:llm:${userId}:${today()}`)) || 0;
    return { used, limit: this.cfg.LLM_DAILY_QUOTA, remaining: Math.max(0, this.cfg.LLM_DAILY_QUOTA - used) };
  }
  private async consume(userId: string) {
    const n = await this.kv.incr(`quota:llm:${userId}:${today()}`, 2 * 86400);
    if (n > this.cfg.LLM_DAILY_QUOTA) throw new AppError(429, 'quota_exceeded', `ใช้ AI ครบโควตาวันนี้แล้ว (${this.cfg.LLM_DAILY_QUOTA} ครั้ง/วัน)`);
  }
  private async call(userId: string, kind: string, p: ResolvedProvider, req: { system: string; messages: ChatMessage[]; json?: boolean; maxTokens?: number }, opts: { allowEmpty?: boolean; timeoutMs?: number } = {}, projectId?: string | null): Promise<CallResult> {
    if (p.userBaseUrl) await this.checkBaseUrl(p.baseUrl);   // before consuming quota
    await this.consume(userId);
    try {
      const r = await callProvider(p, req, { fetch: this.fetchFn, timeoutMs: opts.timeoutMs || this.cfg.LLM_TIMEOUT_MS, totalTimeoutMs: this.cfg.LLM_TOTAL_TIMEOUT_MS, retries: this.cfg.LLM_MAX_RETRIES, allowEmpty: opts.allowEmpty });
      await this.log(userId, kind, { provider: p.id, model: p.model, ms: r.ms, ok: true, attempts: r.attempts, usage: r.usage, jsonFallback: r.jsonFallback || undefined }, projectId);
      return r;
    } catch (e: any) {
      await this.log(userId, kind, { provider: p.id, model: p.model, ok: false, code: e.code || 'error' }, projectId);
      throw e;
    }
  }
  async log(userId: string, kind: string, detail: object, projectId?: string | null) {
    await this.db.query('INSERT INTO history (user_id, project_id, kind, detail) VALUES ($1, $2, $3, $4)', [userId, projectId || null, kind, JSON.stringify(detail)]).catch(() => {});
  }
  private need(r: ResolvedProvider | null, task: string): ResolvedProvider {
    if (!r) throw new AppError(409, 'provider_not_configured', `ยังไม่ได้ตั้งค่า AI สำหรับงาน ${task} — ไปที่ ⚙️ ตั้งค่า AI`);
    return r;
  }

  /* ---------- tasks ---------- */
  async testConnection(userId: string, provider: ProviderId, draft?: Partial<ProviderPrefs & { apiKey: string }>) {
    const s = await this.getSettings(userId); const keys = await this.userKeys(userId);
    const r = this.resolveProvider(provider, s.providers[provider], keys[provider]?.key, draft, await this.canSetBaseUrl(userId));
    if (!r.model) throw new AppError(400, 'validation_error', 'กรุณาระบุโมเดล');
    if (!r.baseUrl) throw new AppError(400, 'validation_error', 'กรุณาระบุ Base URL (ตั้งใน env ของ server)');
    if (PROVIDERS[provider].keyRequired && !r.apiKey) throw new AppError(400, 'provider_key_missing', 'ยังไม่มี API key (ทั้งของผู้ใช้และใน env ของ server)');
    const out = await this.call(userId, 'ai.test', r, { system: SYS_TEST, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], maxTokens: 64 }, { allowEmpty: true, timeoutMs: Math.min(20000, this.cfg.LLM_TIMEOUT_MS) });
    return { ok: true, provider, model: r.model, ms: out.ms, reply: out.text.trim().slice(0, 60), keySource: r.keySource };
  }

  async cachedTranslations(texts: string[]): Promise<Record<string, string>> {
    const uniq = [...new Set(texts.map(t => String(t || '').trim()).filter(t => core.isTh(t)))];
    if (!uniq.length) return {};
    const r = await this.db.query('UPDATE translation_cache SET hits = hits + 1, last_used_at = now() WHERE source_hash = ANY($1) RETURNING source_text, translated', [uniq.map(sha)]);
    return Object.fromEntries(r.rows.map(x => [x.source_text, x.translated]));
  }
  async translate(userId: string, texts: string[]) {
    const uniq = [...new Set(texts.map(t => String(t || '').trim()).filter(t => core.isTh(t)))];
    const translations = await this.cachedTranslations(uniq);
    const cached = Object.keys(translations).length;
    const misses = uniq.filter(t => !translations[t]);
    let route: ResolvedProvider | null = null, ms = 0;
    if (misses.length) {
      route = await this.route(userId, 'translate');
      if (route) {
        const out = await this.call(userId, 'ai.translate', route, { system: SYS_TRANSLATE, messages: [{ role: 'user', content: JSON.stringify({ texts: misses }) }], json: true });
        const j = parseJSONLoose(out.text); ms = out.ms;
        const arr = Array.isArray(j) ? j : Array.isArray(j?.translations) ? j.translations : null;
        if (!arr || arr.length !== misses.length) throw new AppError(502, 'invalid_llm_output', 'จำนวนคำแปลไม่ตรงกับต้นฉบับ');
        for (let i = 0; i < misses.length; i++) {
          const v = String(arr[i] ?? '').trim();
          if (!v || core.isTh(v)) continue;
          translations[misses[i]] = v;
          if (route.userBaseUrl) continue;   // output from a user-controlled endpoint never enters the shared cache (poisoning)
          await this.db.query(`INSERT INTO translation_cache (source_hash, source_text, translated, provider, model) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (source_hash) DO UPDATE SET translated = EXCLUDED.translated, provider = EXCLUDED.provider, model = EXCLUDED.model, last_used_at = now()`,
            [sha(misses[i]), misses[i], v, route.id, route.model]);
        }
      }
    }
    return { translations, cached, translated: Object.keys(translations).length - cached, missing: uniq.filter(t => !translations[t]),
      route: route ? { provider: route.id, model: route.model } : null, ms };
  }

  /** Thai free-text strings inside a spec (the same fields the compiler translates). */
  static thaiStrings(spec: any): string[] {
    const s = core.normalizeSpec(spec); const out: string[] = [];
    for (const k of ['subject', 'scene_detail', 'style_ref', 'vo', 'neg_custom']) out.push(s[k]);
    Object.values(s.custom || {}).forEach(v => out.push(String(v)));
    (s.shots || []).forEach((x: any) => out.push(x?.desc));
    (s.dialogue || []).forEach((d: any) => { if (!d?.thai) out.push(d?.line); });
    return out.filter(t => t && core.isTh(t)).map(t => String(t).trim());
  }
  /** Compile/analyze a spec using cached translations (sync section guarded so concurrent requests can't interleave). */
  async analyze(spec: any, model?: string) {
    const tmap = await this.cachedTranslations(LLMService.thaiStrings(spec));
    return withTranslations(tmap, () => core.analyze(spec, model));
  }

  async parseIdea(userId: string, idea: string, model?: string) {
    const r = this.need(await this.route(userId, 'parse'), 'Quick-start');
    const m = core.MOD[model || 'veo'] || core.MOD.veo;
    const out = await this.call(userId, 'ai.parse', r, { system: sysParse(), messages: [{ role: 'user', content: `Idea: ${idea}\nTarget video model: ${m.name}` }], json: true });
    const j = parseJSONLoose(out.text);
    const p = core.applyParsed(j);
    if (!Object.keys(p.sel).length && !j?.subject_en) throw new AppError(502, 'invalid_llm_output', 'AI ไม่ได้เลือกตัวเลือกใดเลย');
    return { patch: { subject: String(j.subject_en || '').trim().slice(0, 500) || idea, scene_detail: String(j.scene_detail_en || '').trim().slice(0, 1000), sel: p.sel, custom: p.custom, ai: p.ai },
      ignored: p.ignored, notes_th: String(j.notes_th || '').slice(0, 300), count: Object.values(p.sel).reduce((a, x) => a + x.length, 0), provider: r.id, model: r.model, ms: out.ms };
  }

  async enhance(userId: string, spec: any, model?: string, projectId?: string | null) {
    const r = this.need(await this.route(userId, 'enhance'), 'AI Enhance');
    const a = await this.analyze(spec, model);
    if (!a.prompt) throw new AppError(400, 'empty_spec', 'ยังไม่มี prompt — เลือกตัวเลือกหรือ Preset ก่อน');
    const m = core.MOD[a.model];
    const user = JSON.stringify({ target_model: m.name, profile: { format: m.fmt, format_rules: FMT_EN[m.fmt], negative_mode: m.neg, max_chars: m.max, audio: m.audio }, spec: a.spec, compiled_prompt: a.prompt, compiled_negative: a.negative }, null, 1);
    const out = await this.call(userId, 'ai.enhance', r, { system: sysEnhance(m), messages: [{ role: 'user', content: user }], json: true }, {}, projectId);
    const j = parseJSONLoose(out.text);
    const prompt = String(j?.prompt || '').trim();
    if (!prompt) throw new AppError(502, 'invalid_llm_output', 'AI ไม่ได้ส่ง prompt กลับมา');
    const warnings: string[] = [];
    if (prompt.length > m.max) warnings.push(`ยาว ${prompt.length} ตัวอักษร เกินที่แนะนำ (${m.max})`);
    if (core.isTh(prompt.replace(/"[^"]*"/g, ''))) warnings.push('ยังมีภาษาไทยปนนอกบทพูด');
    return { prompt, negative: m.neg === 'field' ? String(j.negative || '').trim() : '', explanation_th: String(j.explanation_th || ''),
      changes_th: Array.isArray(j.changes_th) ? j.changes_th.map(String).slice(0, 8) : [], source: a.prompt, sourceNegative: a.negative,
      model: a.model, warnings, provider: r.id, llmModel: r.model, ms: out.ms };
  }

  /** Generic provider-agnostic call (POST /api/v1/llm). Non-admins always get the server's guard system prompt. */
  async generic(userId: string, isAdmin: boolean, b: { provider?: ProviderId; model?: string; system?: string; messages: ChatMessage[]; json?: boolean; temperature?: number | null; max_tokens?: number; task?: Task }) {
    let r: ResolvedProvider | null;
    if (b.provider) {
      const s = await this.getSettings(userId); const keys = await this.userKeys(userId);
      r = this.resolveProvider(b.provider, s.providers[b.provider], keys[b.provider]?.key, undefined, await this.canSetBaseUrl(userId)); if (!this.ready(r)) r = null;
    } else r = await this.route(userId, b.task || 'enhance');
    r = this.need(r, 'LLM');
    if (b.model) r.model = b.model;
    if (b.temperature !== undefined) r.temperature = b.temperature;
    const system = isAdmin && b.system ? b.system : SYS_GENERIC;
    const out = await this.call(userId, 'ai.llm', r, { system, messages: b.messages, json: b.json, maxTokens: b.max_tokens });
    return { text: out.text, finish_reason: out.finish || null, provider: r.id, model: r.model, usage: out.usage || null, ms: out.ms };
  }
}

/** Temporarily expose cached translations to the shared compiler (core.tr) for one synchronous compile. */
export function withTranslations<T>(map: Record<string, string>, fn: () => T): T {
  const keys = Object.keys(map);
  for (const k of keys) core.trCache[k] = map[k];
  try { return fn(); } finally { for (const k of keys) delete core.trCache[k]; }
}
