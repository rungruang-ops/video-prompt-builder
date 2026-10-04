import { describe, it, expect } from 'vitest';
import { buildRequest, parseResponse, parseJSONLoose, type ResolvedProvider } from '../../src/llm/adapters.js';
import { callProvider, mapHttpError } from '../../src/llm/client.js';
import { makeFakeFetch, type Call } from '../helpers.js';

const P = (id: any, o: Partial<ResolvedProvider> = {}): ResolvedProvider => ({ id, baseUrl: '', apiKey: 'k', model: 'm', temperature: 0.4, maxTokens: 500, ...o });
const req = { system: 'SYS', messages: [{ role: 'user' as const, content: 'hi' }], json: true };

describe('adapters.buildRequest', () => {
  it('OpenAI: chat/completions, bearer, max_completion_tokens, no temperature for reasoning models', () => {
    const r = buildRequest(P('openai', { baseUrl: 'https://api.openai.com/v1', model: 'gpt-6.1-sol' }), req); const b = JSON.parse(r.init.body);
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions'); expect(r.init.headers.authorization).toBe('Bearer k');
    expect(b.max_completion_tokens).toBe(500); expect(b.temperature).toBeUndefined(); expect(b.response_format).toEqual({ type: 'json_object' });
    expect(b.messages[0]).toEqual({ role: 'system', content: 'SYS' });
  });
  it('OpenAI-compatible (xAI/OpenRouter/Ollama/custom): max_tokens + temperature, optional auth, extra headers', () => {
    const x = JSON.parse(buildRequest(P('xai', { baseUrl: 'https://api.x.ai/v1/' }), req).init.body); expect(x.max_tokens).toBe(500); expect(x.temperature).toBe(0.4);
    const o = buildRequest(P('openrouter', { baseUrl: 'https://openrouter.ai/api/v1' }), req); expect(o.init.headers['X-Title']).toBe('Video Prompt Builder');
    const l = buildRequest(P('ollama', { baseUrl: 'http://localhost:11434/v1', apiKey: '' }), req); expect(l.init.headers.authorization).toBeUndefined();
    expect(l.url).toBe('http://localhost:11434/v1/chat/completions');
  });
  it('Anthropic: /messages, x-api-key, anthropic-version, system field', () => {
    const r = buildRequest(P('anthropic', { baseUrl: 'https://api.anthropic.com/v1' }), req); const b = JSON.parse(r.init.body);
    expect(r.url).toBe('https://api.anthropic.com/v1/messages'); expect(r.init.headers['x-api-key']).toBe('k'); expect(r.init.headers['anthropic-version']).toBe('2023-06-01');
    expect(b.system).toBe('SYS'); expect(b.max_tokens).toBe(500); expect(b.response_format).toBeUndefined();
  });
  it('Gemini: generateContent, x-goog-api-key (not in URL), responseMimeType, roles mapped', () => {
    const r = buildRequest(P('gemini', { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.8-flash', temperature: null }),
      { ...req, messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] });
    const b = JSON.parse(r.init.body);
    expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'); expect(r.url).not.toContain('key=');
    expect(r.init.headers['x-goog-api-key']).toBe('k'); expect(b.generationConfig).toEqual({ maxOutputTokens: 500, responseMimeType: 'application/json' });
    expect(b.contents.map((c: any) => c.role)).toEqual(['user', 'model']); expect(b.systemInstruction.parts[0].text).toBe('SYS');
  });
});
describe('adapters.parseResponse', () => {
  it('parses each wire format', () => {
    expect(parseResponse('openai', { choices: [{ message: { content: 'A' }, finish_reason: 'stop' }] }).text).toBe('A');
    expect(parseResponse('anthropic', { content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'B' }], stop_reason: 'end_turn' }).text).toBe('B');
    expect(parseResponse('gemini', { candidates: [{ content: { parts: [{ text: 'hmm', thought: true }, { text: 'C' }] } }] }).text).toBe('C');
    expect(() => parseResponse('gemini', { promptFeedback: { blockReason: 'SAFETY' } })).toThrow(/SAFETY/);
  });
  it('parseJSONLoose handles fences and prose', () => {
    expect(parseJSONLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJSONLoose('Sure! {"b":2} hope that helps')).toEqual({ b: 2 });
    expect(() => parseJSONLoose('nope')).toThrow();
  });
});
describe('client.callProvider', () => {
  const opts = (calls: Call[], extra = {}) => ({ fetch: makeFakeFetch(calls), timeoutMs: 200, retries: 2, sleep: async () => {}, ...extra });
  it('JSON-mode fallback on 400', async () => {
    const calls: Call[] = [];
    const r = await callProvider(P('openrouter', { baseUrl: 'https://openrouter.ai/api/v1', model: 'no-json-mode' }), { system: 'Connection test', messages: [{ role: 'user', content: 'x' }], json: true }, opts(calls));
    expect(r.text).toBe('OK'); expect(r.jsonFallback).toBe(true); expect(calls).toHaveLength(2); expect(calls[1].body.response_format).toBeUndefined();
  });
  it('retries 5xx then maps to provider_error', async () => {
    const calls: Call[] = [];
    await expect(callProvider(P('custom', { baseUrl: 'http://x/v1', model: 'always-500' }), req, opts(calls))).rejects.toMatchObject({ code: 'provider_error', status: 502 });
    expect(calls).toHaveLength(3);
  });
  it('maps 401, network and timeout', async () => {
    await expect(callProvider(P('anthropic', { baseUrl: 'https://api.anthropic.com/v1', apiKey: 'bad-key' }), req, opts([]))).rejects.toMatchObject({ code: 'provider_auth' });
    await expect(callProvider(P('custom', { baseUrl: 'http://unreachable.invalid/v1' }), req, opts([]))).rejects.toMatchObject({ code: 'provider_unreachable', status: 502 });
    await expect(callProvider(P('custom', { baseUrl: 'http://slow.invalid/v1' }), req, opts([]))).rejects.toMatchObject({ code: 'provider_timeout', status: 504 });
  });
  it('mapHttpError table', () => {
    expect(mapHttpError(429, 'x', 'P').status).toBe(429); expect(mapHttpError(404, 'x', 'P').code).toBe('provider_not_found');
    expect(mapHttpError(418, 'x', 'P').code).toBe('provider_bad_request');
  });
});
