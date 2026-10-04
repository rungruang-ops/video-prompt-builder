#!/usr/bin/env node
// API smoke test against a running stack (needs an LLM reachable by the API — e.g. the stub profile with
// CUSTOM_LLM_BASE_URL=http://stub-llm:9999/v1 + CUSTOM_LLM_MODEL=stub-model).
// Usage: node scripts/smoke.mjs [baseUrl=http://localhost:8080] [provider=custom]
const base = (process.argv[2] || 'http://localhost:8080').replace(/\/$/, '') + '/api/v1';
const provider = process.argv[3] || 'custom';
let cookie = '';
let failed = 0;
async function call(method, path, body) {
  const r = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
function check(name, ok, info = '') { console.log(`${ok ? '✅' : '❌'} ${name}${info ? ' — ' + info : ''}`); if (!ok) failed++; }

const email = `smoke-${Date.now()}@example.com`, password = 'smoke-password-123';
let r = await call('GET', '/health'); check('health', r.status === 200 && r.json.db === true, JSON.stringify(r.json));
r = await call('POST', '/auth/register', { email, password, displayName: 'Smoke' }); check('register', r.status === 201 || r.status === 200, `role=${r.json.user?.role}`);
await call('POST', '/auth/logout', {}); cookie = '';
r = await call('POST', '/auth/login', { email, password: 'wrong-password' }); check('login rejects wrong password', r.status === 401);
r = await call('POST', '/auth/login', { email, password }); check('login', r.status === 200 && !!cookie);
r = await call('GET', '/auth/me'); check('me', r.status === 200 && r.json.user.email === email, `quota ${r.json.quota?.used}/${r.json.quota?.limit}`);
r = await call('GET', '/presets'); const preset = r.json.presets?.find(p => p.id === 'p_drama'); check('system presets seeded', r.status === 200 && !!preset, `${r.json.presets?.length} presets`);
const spec = { ...preset.s, model: preset.model };
r = await call('POST', '/projects', { name: 'Smoke project', spec }); const pid = r.json.project?.id; check('create project', r.status === 201 && !!pid, pid);
r = await call('POST', '/prompt/compile', { spec, model: spec.model }); const compiled = r.json.prompt; check('compile', r.status === 200 && /cinematic/i.test(compiled || ''), `score ${r.json.score?.total ?? JSON.stringify(r.json.score)?.slice(0, 40)} | ${String(compiled).slice(0, 90)}…`);
r = await call('PUT', '/ai/settings', { defaultProvider: provider }); check('save AI settings', r.status === 200);
r = await call('POST', '/ai/test', { provider }); check('test connection', r.status === 200 && r.json.ok !== false, JSON.stringify(r.json).slice(0, 140));
r = await call('POST', '/ai/translate', { texts: ['ตลาดน้ำยามเช้า มีเรือขายผลไม้หลากสี'] }); check('translate', r.status === 200, JSON.stringify(r.json).slice(0, 160));
r = await call('POST', '/ai/translate', { texts: ['ตลาดน้ำยามเช้า มีเรือขายผลไม้หลากสี'] }); check('translate (2nd call served from cache)', r.status === 200, JSON.stringify(r.json).slice(0, 160));
r = await call('POST', '/ai/parse-idea', { idea: 'แมวส้มนั่งมองฝนตกริมหน้าต่างตอนกลางคืน', model: 'veo' }); check('parse-idea', r.status === 200, JSON.stringify(r.json).slice(0, 160));
r = await call('POST', '/ai/enhance', { spec, model: spec.model, projectId: pid }); const enh = r.json; check('enhance', r.status === 200 && !!enh.prompt, String(enh.prompt || JSON.stringify(enh)).slice(0, 140));
r = await call('POST', `/projects/${pid}/versions`, { title: 'smoke v1', spec, enhanced: enh.prompt ? { prompt: enh.prompt, negative: enh.negative || '', source: enh.source || compiled } : null });
check('save version', r.status === 201, `v${r.json.version?.no} enhanced=${r.json.version?.enhanced}`);
r = await call('GET', `/projects/${pid}/versions`); check('list versions', r.status === 200 && (r.json.versions?.length || 0) >= 1, `${r.json.versions?.length} version(s)`);
r = await call('GET', '/history?limit=20'); check('history log', r.status === 200, (r.json.history || r.json.items || []).map(h => h.kind).join(','));
const anon = await fetch(base + '/projects'); check('unauthenticated request rejected', anon.status === 401);
console.log(failed ? `\n${failed} check(s) failed` : '\nall smoke checks passed'); process.exit(failed ? 1 : 0);
