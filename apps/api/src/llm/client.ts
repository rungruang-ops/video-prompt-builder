import { AppError } from '../lib/errors.js';
import { redactSecrets, UNSAFE_CONNECT } from '../lib/netguard.js';
import { PROVIDERS } from './providers.js';
import { buildRequest, parseResponse, type LLMRequest, type ResolvedProvider, type ParsedResponse } from './adapters.js';

export type FetchFn = typeof fetch;
export interface CallOptions { fetch: FetchFn; timeoutMs: number; retries: number; allowEmpty?: boolean; sleep?: (ms: number) => Promise<void>; /** overall budget incl. retries (fits serverless maxDuration) */ totalTimeoutMs?: number }
export interface CallResult extends ParsedResponse { ms: number; attempts: number; provider: string; model: string; jsonFallback?: boolean }

const defaultSleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const short = (s: string) => String(s || '').replace(/\s+/g, ' ').slice(0, 300);

/** Map an upstream HTTP failure to a stable API error. */
export function mapHttpError(status: number, msg: string, provider: string): AppError {
  const m = short(msg) || `HTTP ${status}`;
  if (status === 401 || status === 403) return new AppError(400, 'provider_auth', `${provider}: API key ไม่ถูกต้องหรือไม่มีสิทธิ์ (HTTP ${status}) — ${m}`, { providerStatus: status });
  if (status === 404) return new AppError(400, 'provider_not_found', `${provider}: ไม่พบโมเดลหรือ URL (HTTP 404) — ${m}`, { providerStatus: status });
  if (status === 429) return new AppError(429, 'provider_rate_limited', `${provider}: ถูกจำกัดอัตราการเรียกหรือโควตาหมด (HTTP 429) — ${m}`, { providerStatus: status });
  if (status >= 500) return new AppError(502, 'provider_error', `${provider}: เซิร์ฟเวอร์ผู้ให้บริการขัดข้อง (HTTP ${status}) — ${m}`, { providerStatus: status });
  return new AppError(400, 'provider_bad_request', `${provider}: HTTP ${status} — ${m}`, { providerStatus: status });
}
const retryable = (status: number) => status === 429 || status >= 500;

/** Call a provider with timeout, retries (network/429/5xx, exponential backoff, Retry-After) and JSON-mode fallback. */
export async function callProvider(p: ResolvedProvider, req: LLMRequest, o: CallOptions): Promise<CallResult> {
  const def = PROVIDERS[p.id]; const sleep = o.sleep || defaultSleep;
  let json = !!req.json, jsonFallback = false, attempt = 0;
  const t0 = Date.now(); const deadline = t0 + Math.max(o.timeoutMs, o.totalTimeoutMs ?? Infinity);
  const left = () => deadline - Date.now();
  const timeoutErr = () => new AppError(504, 'provider_timeout', `${def.name}: หมดเวลารอคำตอบ (${Math.round(Math.min(o.timeoutMs, o.totalTimeoutMs ?? o.timeoutMs) / 1000)} วินาที)`);
  for (;;) {
    attempt++;
    if (left() < 500) throw timeoutErr();
    const { url, init } = buildRequest(p, { ...req, json });
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), Math.min(o.timeoutMs, left()));
    let res: Response;
    // redirect: 'error' — never follow a provider redirect (could bounce the request to an internal address)
    try { res = await o.fetch(url, { ...init, redirect: 'error', signal: ctrl.signal }); }
    catch (e: any) {
      clearTimeout(timer);
      // connect-time SSRF guard (DNS changed after the pre-check, e.g. rebinding) — never retried
      if (e?.cause?.code === UNSAFE_CONNECT) throw new AppError(400, 'unsafe_base_url', `Base URL ไม่อนุญาต: ${def.name} ชี้ไปยัง IP ภายใน/สงวนตอนเชื่อมต่อ (ตั้ง LLM_URL_ALLOWLIST ถ้าตั้งใจ)`);
      const timeout = e?.name === 'AbortError';
      const wait = 400 * 2 ** (attempt - 1);
      if (attempt <= o.retries && !timeout && left() > wait + 1000) { await sleep(wait); continue; }
      if (timeout) throw timeoutErr();
      throw new AppError(502, 'provider_unreachable', `${def.name}: เชื่อมต่อไม่ได้ (${short(redactSecrets(e?.cause?.code || e?.message, p.apiKey))}) — ตรวจ Base URL / เครือข่ายของ server`);
    }
    let raw: string;
    try { raw = await res.text(); } catch (e: any) { clearTimeout(timer); if (e?.name === 'AbortError') throw timeoutErr(); throw new AppError(502, 'provider_unreachable', `${def.name}: อ่านคำตอบไม่สำเร็จ`); }
    clearTimeout(timer);
    let data: any = null; try { data = JSON.parse(raw); } catch { /* not json */ }
    if (!res.ok) {
      const er = data && (data.error || data);
      const msg = redactSecrets(String((er && (er.message || (typeof er === 'string' ? er : ''))) || raw || res.statusText), p.apiKey);
      if (json && res.status === 400 && /response_format|json_object|json mode|responseMimeType/i.test(msg)) { json = false; jsonFallback = true; attempt--; continue; }
      if (retryable(res.status) && attempt <= o.retries) {
        const ra = Number(res.headers.get('retry-after')); const wait = Math.min(5000, ra > 0 ? ra * 1000 : 500 * 2 ** (attempt - 1));
        if (left() > wait + 1000) { await sleep(wait); continue; }
      }
      throw mapHttpError(res.status, msg, def.name);
    }
    if (!data) throw new AppError(502, 'invalid_provider_response', `${def.name}: คำตอบไม่ใช่ JSON`);
    let out: ParsedResponse;
    try { out = parseResponse(def.kind, data); } catch (e: any) { throw new AppError(502, e.code || 'invalid_provider_response', `${def.name}: ${e.message}`); }
    if (!out.text && !o.allowEmpty) {
      throw new AppError(502, 'empty_llm_output', /max|length/i.test(out.finish || '') ? `${def.name}: ตอบว่างเพราะ max tokens ไม่พอ — เพิ่ม Max tokens` : `${def.name}: ตอบกลับว่าง`);
    }
    return { ...out, ms: Date.now() - t0, attempts: attempt, provider: p.id, model: p.model, jsonFallback };
  }
}
