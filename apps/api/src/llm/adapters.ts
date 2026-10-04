import { PROVIDERS, type ProviderId, type Kind } from './providers.js';

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface LLMRequest { system: string; messages: ChatMessage[]; json?: boolean; temperature?: number | null; maxTokens?: number }
export interface ResolvedProvider { id: ProviderId; baseUrl: string; apiKey: string; model: string; temperature: number | null; maxTokens: number; /** base URL typed by the user (not from env) → SSRF-checked */ userBaseUrl?: boolean }
export interface HttpRequest { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } }

export const isOpenAIReasoning = (m: string) => /^(o\d|gpt-5|gpt-6)/i.test(m || '');
const trimBase = (u: string) => u.trim().replace(/\/+$/, '');

/** Build the provider-specific HTTP request (wire format) for a chat call. */
export function buildRequest(p: ResolvedProvider, req: LLMRequest): HttpRequest {
  const def = PROVIDERS[p.id]; const base = trimBase(p.baseUrl || def.baseUrl);
  const temp = req.temperature !== undefined ? req.temperature : p.temperature;
  const maxT = req.maxTokens || p.maxTokens || 4096;
  if (def.kind === 'anthropic') {
    const body: Record<string, unknown> = { model: p.model, max_tokens: maxT, system: req.system, messages: req.messages };
    if (temp !== null && temp !== undefined) body.temperature = temp;
    return { url: base + '/messages', init: { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) } };
  }
  if (def.kind === 'gemini') {
    const gc: Record<string, unknown> = { maxOutputTokens: maxT };
    if (temp !== null && temp !== undefined) gc.temperature = temp;
    if (req.json) gc.responseMimeType = 'application/json';
    const body = { systemInstruction: { parts: [{ text: req.system }] }, contents: req.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: gc };
    const model = encodeURIComponent(String(p.model).replace(/^models\//, ''));
    return { url: `${base}/models/${model}:generateContent`, init: { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': p.apiKey }, body: JSON.stringify(body) } };
  }
  const body: Record<string, unknown> = { model: p.model, messages: [{ role: 'system', content: req.system }, ...req.messages] };
  if (p.id === 'openai' && /api\.openai\.com/.test(base)) { body.max_completion_tokens = maxT; if (temp !== null && temp !== undefined && !isOpenAIReasoning(p.model)) body.temperature = temp; }
  else { body.max_tokens = maxT; if (temp !== null && temp !== undefined) body.temperature = temp; }
  if (req.json) body.response_format = { type: 'json_object' };
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(def.headers || {}) };
  if (p.apiKey) headers.authorization = 'Bearer ' + p.apiKey;
  return { url: base + '/chat/completions', init: { method: 'POST', headers, body: JSON.stringify(body) } };
}

export interface ParsedResponse { text: string; finish?: string; usage?: { input?: number; output?: number } }
/** Extract text (+finish reason, usage) from a provider response body. */
export function parseResponse(kind: Kind, d: any): ParsedResponse {
  if (kind === 'anthropic') {
    return { text: (d?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''), finish: d?.stop_reason,
      usage: { input: d?.usage?.input_tokens, output: d?.usage?.output_tokens } };
  }
  if (kind === 'gemini') {
    const c = (d?.candidates || [])[0];
    if (!c) { const br = d?.promptFeedback?.blockReason; const e: any = new Error(br ? `Gemini blocked the request (${br})` : 'Gemini returned no candidates'); e.code = 'provider_blocked'; throw e; }
    return { text: ((c.content || {}).parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || '').join(''), finish: c.finishReason,
      usage: { input: d?.usageMetadata?.promptTokenCount, output: d?.usageMetadata?.candidatesTokenCount } };
  }
  const ch = (d?.choices || [])[0]; let content = ch?.message?.content ?? '';
  if (Array.isArray(content)) content = content.map((p: any) => p.text || '').join('');
  return { text: content || '', finish: ch?.finish_reason, usage: { input: d?.usage?.prompt_tokens, output: d?.usage?.completion_tokens } };
}

/** Tolerant JSON extraction (strips ```json fences / leading prose). */
export function parseJSONLoose(t: string): any {
  const s = String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch { /* fallthrough */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* fallthrough */ } }
  const e: any = new Error('LLM output is not valid JSON'); e.code = 'invalid_llm_output'; throw e;
}
