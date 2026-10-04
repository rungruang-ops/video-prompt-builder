/* Deterministic stub for OpenAI-compatible, Anthropic Messages and Gemini generateContent APIs.
   Used by the docker "stub" profile, local dev without real keys, API tests and the Playwright e2e. */
const TH = {
  'ตลาดน้ำยามเช้า มีเรือขายผลไม้หลากสี': 'a morning floating market with boats selling colorful fruit',
  'แมวส้มตัวอ้วน': 'a chubby orange cat',
  'แมวส้มนั่งมองฝน': 'an orange cat watching the rain',
};
export function detect(url) {
  if (/\/messages(\?|$)/.test(url)) return 'anthropic';
  if (/:generateContent(\?|$)/.test(url)) return 'gemini';
  if (/\/chat\/completions(\?|$)/.test(url)) return 'openai';
  return null;
}
function keyOf(kind, h) {
  if (kind === 'anthropic') return h['x-api-key'] || '';
  if (kind === 'gemini') return h['x-goog-api-key'] || '';
  return String(h['authorization'] || '').replace(/^Bearer\s+/i, '');
}
export function replyFor(system, user) {
  if (/^Connection test/.test(system)) return 'OK';
  if (/^Task: translate/.test(system)) {
    const texts = JSON.parse(user).texts || [];
    return JSON.stringify({ translations: texts.map((t, i) => TH[t] || `english translation of Thai text #${i + 1} (${[...t].length} chars)`) });
  }
  if (/^Task: parse-idea/.test(system)) {
    return '```json\n' + JSON.stringify({
      subject_en: 'a chubby orange cat sitting by a rainy window', scene_detail_en: 'raindrops streaking down the glass, warm lamp inside',
      selections: { count: ['animal'], location: ['window'], time: ['night', 'dawn'], weather: ['rain'], shot: ['mcu'], movement: ['dolly_in'],
        lighting: ['moon', 'bogus_light'], palette: ['cool'], mood: ['melancholy', 'calm', 'dreamy'], style: ['cinematic'], fake_group: ['whatever'] },
      custom: { location: 'a cozy old apartment window', fake_group: 'x' },
      notes_th: 'ตีความเป็นฉากแมวส้มมองฝนยามค่ำ โทนเย็นเหงาๆ กล้องดันเข้าช้าๆ (stub)',
    }) + '\n```';
  }
  if (/^Task: enhance/.test(system)) {
    const u = JSON.parse(user); const src = String(u.compiled_prompt || ''); const max = Number(u.profile?.max_chars) || 2000;
    const extra = ' Rich tactile detail: soft volumetric light catches drifting particles, textures read crisply, motion feels natural with gentle motion blur.';
    let prompt = (src.replace(/\s+$/, '') + extra).slice(0, max);
    return JSON.stringify({ prompt, negative: u.compiled_negative ? u.compiled_negative + ', flicker, warped hands' : '',
      explanation_th: 'เพิ่มรายละเอียดเชิงภาพ (แสง เนื้อผิว การเคลื่อนไหว) ต่อท้าย โดยคงทุกตัวเลือกในสเปกไว้เหมือนเดิม (stub)',
      changes_th: ['เพิ่ม texture และพฤติกรรมของแสง', 'คงลำดับกล้อง → ตัวละคร → ฉาก ตามรูปแบบของโมเดล'] });
  }
  return 'stub reply: ' + String(user).slice(0, 120);
}
const errBody = (kind, status, message) =>
  kind === 'anthropic' ? { type: 'error', error: { type: status === 401 ? 'authentication_error' : 'invalid_request_error', message } }
  : kind === 'gemini' ? { error: { code: status, message, status: status === 401 ? 'UNAUTHENTICATED' : 'INVALID_ARGUMENT' } }
  : { error: { message, type: 'invalid_request_error', code: status === 401 ? 'invalid_api_key' : null } };

/** Pure request → response function. headers must be lower-cased. */
export function respond(url, headers, bodyText) {
  const kind = detect(url);
  if (!kind) return { status: 404, json: { error: { message: 'stub: unknown endpoint ' + url } } };
  const key = keyOf(kind, headers);
  if (key === 'bad-key' || ((kind !== 'openai') && !key)) return { status: 401, json: errBody(kind, 401, 'Invalid API key (stub)') };
  let body; try { body = JSON.parse(bodyText || '{}'); } catch { return { status: 400, json: errBody(kind, 400, 'invalid JSON body') }; }
  let system = '', user = '', model = body.model || '';
  if (kind === 'anthropic') { system = body.system || ''; user = body.messages?.at(-1)?.content || ''; }
  else if (kind === 'gemini') { system = body.systemInstruction?.parts?.[0]?.text || ''; user = body.contents?.at(-1)?.parts?.[0]?.text || ''; model = (url.match(/models\/([^:]+):/) || [])[1]; }
  else { system = body.messages?.[0]?.content || ''; user = body.messages?.at(-1)?.content || ''; }
  if (model === 'no-json-mode' && body.response_format) return { status: 400, json: errBody(kind, 400, 'response_format json_object is not supported for this model') };
  if (model === 'always-500') return { status: 500, json: errBody(kind, 500, 'upstream exploded (stub)') };
  const text = replyFor(system, user);
  if (kind === 'anthropic') return { status: 200, json: { id: 'msg_stub', type: 'message', role: 'assistant', model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 } } };
  if (kind === 'gemini') return { status: 200, json: { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 } } };
  return { status: 200, json: { id: 'chatcmpl-stub', object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } } };
}
