import type { Config } from '../config.js';

export type ProviderId = 'openai' | 'gemini' | 'anthropic' | 'xai' | 'openrouter' | 'ollama' | 'custom';
export type Kind = 'openai' | 'gemini' | 'anthropic';
export interface ProviderDef {
  id: ProviderId; name: string; kind: Kind; baseUrl: string; models: string[]; keyRequired: boolean;
  env: { key: keyof Config; base: keyof Config; model: keyof Config }; headers?: Record<string, string>; note: string; keyUrl?: string;
}
export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  openai: { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', models: ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra'], keyRequired: true,
    env: { key: 'OPENAI_API_KEY', base: 'OPENAI_BASE_URL', model: 'OPENAI_MODEL' }, keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Chat Completions + JSON mode · reasoning models (o*/gpt-5*/gpt-6*) ใช้ max_completion_tokens และไม่ส่ง temperature' },
  gemini: { id: 'gemini', name: 'Google Gemini', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview', 'gemini-flash-latest'], keyRequired: true,
    env: { key: 'GEMINI_API_KEY', base: 'GEMINI_BASE_URL', model: 'GEMINI_MODEL' }, keyUrl: 'https://aistudio.google.com/apikey',
    note: 'generateContent + x-goog-api-key + responseMimeType application/json · Gemini 3.x แนะนำ temperature ค่าเริ่มต้น' },
  anthropic: { id: 'anthropic', name: 'Anthropic Claude', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', models: ['claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-opus-5-5'], keyRequired: true,
    env: { key: 'ANTHROPIC_API_KEY', base: 'ANTHROPIC_BASE_URL', model: 'ANTHROPIC_MODEL' }, keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Messages API + anthropic-version 2023-06-01 · ไม่มี JSON mode → บังคับด้วย system prompt + ตรวจ JSON ฝั่ง server' },
  xai: { id: 'xai', name: 'xAI Grok', kind: 'openai', baseUrl: 'https://api.x.ai/v1', models: ['grok-4.7', 'grok-4.6', 'grok-4.3'], keyRequired: true,
    env: { key: 'XAI_API_KEY', base: 'XAI_BASE_URL', model: 'XAI_MODEL' }, keyUrl: 'https://console.x.ai',
    note: 'OpenAI-compatible /chat/completions (เรียกจาก server จึงไม่ติด CORS)' },
  openrouter: { id: 'openrouter', name: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', models: ['openai/gpt-6.1-sol', 'anthropic/claude-sonnet-5-5', 'google/gemini-3.8-flash', 'x-ai/grok-4.7'], keyRequired: true,
    env: { key: 'OPENROUTER_API_KEY', base: 'OPENROUTER_BASE_URL', model: 'OPENROUTER_MODEL' }, keyUrl: 'https://openrouter.ai/keys', headers: { 'X-Title': 'Video Prompt Builder' },
    note: 'OpenAI-compatible · ถ้าโมเดลไม่รองรับ response_format จะ retry แบบไม่ใช้ JSON mode อัตโนมัติ' },
  ollama: { id: 'ollama', name: 'Ollama (local)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', models: ['llama3.3', 'qwen3', 'gemma3', 'mistral'], keyRequired: false,
    env: { key: 'OLLAMA_API_KEY', base: 'OLLAMA_BASE_URL', model: 'OLLAMA_MODEL' },
    note: 'รันบนเครื่อง/เซิร์ฟเวอร์ของคุณ ไม่ต้องใช้ key · ใน Docker ใช้ http://host.docker.internal:11434/v1' },
  custom: { id: 'custom', name: 'Custom (OpenAI-compatible)', kind: 'openai', baseUrl: '', models: [], keyRequired: false,
    env: { key: 'CUSTOM_LLM_API_KEY', base: 'CUSTOM_LLM_BASE_URL', model: 'CUSTOM_LLM_MODEL' },
    note: 'vLLM / LM Studio / LiteLLM / gateway ใดๆ ที่รองรับ POST {base}/chat/completions' },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
export const isProviderId = (s: unknown): s is ProviderId => typeof s === 'string' && s in PROVIDERS;

/** Server-level (env) configuration for a provider. */
export function envProvider(cfg: Config, id: ProviderId) {
  const d = PROVIDERS[id];
  return { apiKey: String(cfg[d.env.key] || ''), baseUrl: String(cfg[d.env.base] || '') || d.baseUrl, model: String(cfg[d.env.model] || '') || d.models[0] || '' };
}
