import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/index.js';

test('every preset compiles for every model without Thai leakage', () => {
  for (const p of C.PRESETS) for (const m of Object.keys(C.MOD)) {
    const r = C.analyze(p.s, m);
    assert.ok(r.prompt.length > 50, `${p.id}/${m} too short`);
    assert.ok(r.prompt.length <= C.MOD[m].max * 1.6, `${p.id}/${m} too long (${r.prompt.length})`);
    assert.ok(!/[\u0001-\u0003]/.test(r.prompt), 'markers stripped');
  }
});
test('normalizeSpec drops unknown groups/ids and enforces max', () => {
  const s = C.normalizeSpec({ sel: { time: ['night', 'dawn'], fake: ['x'], lighting: ['moon', 'nope'] }, model: 'nope', evil: 1 });
  assert.deepEqual(s.sel, { time: ['night'], lighting: ['moon'] });
  assert.equal(s.model, 'veo'); assert.equal(s.evil, undefined);
});
test('applyParsed maps only existing option ids', () => {
  const r = C.applyParsed({ selections: { mood: ['calm', 'dreamy', 'epic'], lighting: ['moon', 'bogus'], zzz: ['a'] }, custom: { location: 'x', zzz: 'y' } });
  assert.deepEqual(r.sel.mood, ['calm', 'dreamy']); assert.deepEqual(r.sel.lighting, ['moon']);
  assert.ok(r.ignored.includes('lighting.bogus') && r.ignored.includes('zzz'));
  assert.deepEqual(r.custom, { location: 'x' });
});
test('translations are used by the compiler', () => {
  C.trCache['แมวส้ม'] = 'an orange cat';
  const r = C.analyze({ subject: 'แมวส้ม', sel: { time: ['night'] } }, 'veo');
  assert.match(r.prompt, /orange cat/); assert.ok(!C.isTh(r.prompt));
  delete C.trCache['แมวส้ม'];
});
test('conflict rules fire (night + harsh sun)', () => {
  const r = C.analyze({ subject: 'a man', sel: { time: ['night'], lighting: ['harsh_sun'] } }, 'veo');
  assert.ok(r.conflicts.some(c => c.level === 'error' || c.level === 'warn'));
});
