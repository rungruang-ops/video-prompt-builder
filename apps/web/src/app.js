/* Video Prompt Builder — web UI (ported from the single-file prototype; compiler/taxonomy come from @vpb/core). */
import * as C from '@vpb/core';
import { api } from './api.js';
import { initAccount } from './account.js';
import { initAdmin } from './admin.js';

// Strict CSP (style-src 'self', no 'unsafe-inline'): markup never carries inline style attributes.
// Dynamic colours travel as data-* attributes and are applied through CSSOM, which CSP allows.
//   data-sc → --c (step/group colour) · data-bg → background · data-fg → color
const DYN_SEL = '[data-sc],[data-bg],[data-fg]';
function applyDynStyles(root) {
  if (root.nodeType !== 1) return;
  const els = root.querySelectorAll(DYN_SEL);
  for (const el of root.matches(DYN_SEL) ? [root, ...els] : els) {
    const d = el.dataset;
    if (d.sc) el.style.setProperty('--c', d.sc);
    if (d.bg) el.style.background = d.bg;
    if (d.fg) el.style.color = d.fg;
  }
}
new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(applyDynStyles); })
  .observe(document.documentElement, { childList: true, subtree: true });
const { GROUPS, STEPS, G2S, OPT, MODELS, MOD, blank, clone, esc, TH_RE, isTh, M, strip, capM, art, stripPrep, joinList, S, sel, has, any, ph, pm, buildParts, autoNeg, negList, audioLines, sentence, sceneSentence, openerSentence, styleSentence, lightSentence, lensSentence, shotsText, FORMATTERS, compile, NIGHT, allIds, dur, shotSum, RULES, thaiFields, evalConflicts, WEIGHTS, score, paramsObj, specJSON, thaiSummary, taxonomyForLLM, applyParsed, tr, withState, normalizeSpec, analyze } = C;
const trCache = C.trCache;
let PRESETS = C.PRESETS.map(p => ({...p, system: true}));

/* ---- state (shared with @vpb/core via setState) ---- */
let state = blank(); C.setState(state);
function setState(s) { state = s; C.setState(s); }
let ui = {step:0, mode:'wizard', outTab:'prompt', search:''};
let compileCache = {};
const $ = s => document.querySelector(s);
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600); }
function copyText(t, label) {
  const done = () => toast('📋 คัดลอก' + (label || '') + 'แล้ว');
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch(e) {} ta.remove(); done(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
}

/* ============================================================
   9) RENDER — NAV / CENTER
   ============================================================ */
function stepCount(s) {
  let n = 0;
  s.items.forEach(it => {
    if (typeof it === 'string') n += S(it).length + ((state.custom[it] || '').trim() ? 1 : 0);
    else if (it.f && (state[it.f] || '').trim()) n++;
    else if (it.t === 'shots') n += state.shots.length;
    else if (it.t === 'dialogue') n += state.dialogue.filter(d => d.line).length;
  });
  return n;
}
function renderNav() {
  $('#nav').innerHTML = '<div class="navtitle">ขั้นตอน</div>' + STEPS.map((s, i) => {
    const n = stepCount(s);
    return `<button class="step ${ui.mode==='wizard'&&ui.step===i?'on':''}" data-step="${i}" data-sc="${s.c}"><span class="num">${s.e}</span><span class="sname">${i+1}. ${s.th}</span>${n?`<span class="cnt">${n}</span>`:''}</button>`;
  }).join('') + `<div class="navfoot">💡 <b>เคล็ดลับ</b><br>ไม่ต้องเลือกครบทุกขั้น — ดูคะแนนความครบถ้วนทางขวา แล้วกด "➕" เฉพาะส่วนที่ขาด<br><br>เส้นใต้สีในพรีวิวบอกว่าแต่ละท่อนของ prompt มาจากขั้นตอนไหน<br><br>🔒 ล็อกกลุ่มที่ไม่อยากให้ A/B Variations เปลี่ยน</div>`;
}
function chipHTML(g, o, bad) {
  const on = S(g).includes(o.id), ai = state.ai[g + '.' + o.id], G_ = GROUPS[g];
  const vis = G_.swatch && o.sw ? `<span class="sw">${o.sw.map(x => `<i data-bg="${x}"></i>`).join('')}</span>` : `<span class="emo">${o.e}</span>`;
  const title = esc((o.en || '(พารามิเตอร์ ไม่ใส่ในข้อความ prompt)') + (o.tip ? ' — ' + o.tip : '') + (o.hl ? '  ·  Hailuo: ' + o.hl : ''));
  return `<button class="chip ${on?'on':''} ${bad.has(g+'.'+o.id)?'bad':''}" data-g="${g}" data-id="${o.id}" title="${title}" aria-pressed="${on}">${vis}<span class="lab">${esc(o.th)}</span>${G_.cards?`<span class="en">${esc(o.en||'')}</span>`:''}${ai?'<span class="ai">✨AI</span>':''}</button>`;
}
function groupHTML(g, c, bad) {
  const G_ = GROUPS[g]; const q = ui.mode === 'advanced' ? ui.search.trim().toLowerCase() : '';
  let opts = G_.opts;
  if (q) { opts = opts.filter(o => (o.th + ' ' + o.en + ' ' + (o.kw || []).join(' ') + ' ' + G_.th).toLowerCase().includes(q)); if (!opts.length) return ''; }
  const locked = state.locks.includes(g);
  return `<div class="group" id="g-${g}" data-sc="${c}">
    <div class="ghead"><span class="gtitle">${G_.e} ${G_.th}</span><span class="gmeta">${G_.max ? 'เลือกได้ ' + G_.max : 'เลือก 1'}</span>${G_.note?`<span class="gmeta dashed">${G_.note}</span>`:''}<span class="sp"></span>
      <button class="ib ${locked?'locked':''}" data-lock="${g}" title="ล็อกไม่ให้ A/B Variations เปลี่ยนกลุ่มนี้">${locked?'🔒 ล็อก':'🔓'}</button>
      ${any(g)?`<button class="ib" data-clear="${g}">ล้าง</button>`:''}</div>
    <div class="chips ${G_.cards?'cards':''}">${opts.map(o => chipHTML(g, o, bad)).join('')}</div>
    <input class="custom" data-custom="${g}" placeholder="อื่นๆ (พิมพ์เอง)…" value="${esc(state.custom[g]||'')}">
  </div>`;
}
function optSel(gid, val, attr) { return `<select ${attr}><option value="">— ${GROUPS[gid].th.split(' ')[0]} —</option>${GROUPS[gid].opts.map(o=>`<option value="${o.id}" ${o.id===val?'selected':''}>${o.e} ${esc(o.th)}</option>`).join('')}</select>`; }
function itemHTML(it, s, bad) {
  if (typeof it === 'string') return groupHTML(it, s.c, bad);
  if (ui.mode === 'advanced' && ui.search.trim()) return '';
  if (it.t === 'text') return `<div class="group field" data-sc="${s.c}"><label>${it.label}<span class="hint">${it.hint||''}</span></label>
     <textarea rows="2" data-field="${it.f}" placeholder="${esc(it.ph)}">${esc(state[it.f]||'')}</textarea><div class="thflag ${isTh(state[it.f])?'show':''}" data-thflag="${it.f}">🇹🇭 พบภาษาไทย — จะถูกแปลเป็นอังกฤษด้วย LLM ในระบบจริง</div></div>`;
  if (it.t === 'audioNote') { const m = MOD[state.model];
    return `<div class="notice ${m.audio===true?'':'warn'}">${m.audio===true?`✅ ${m.name} รองรับการสร้างเสียง — บทพูด ดนตรี และ SFX จะถูกใส่ใน prompt`:m.audio==='partial'?`⚠️ ${m.name}: การสร้างเสียงขึ้นกับเวอร์ชันโมเดล`:`🔇 ${m.name} ไม่สร้างเสียง — ข้อมูลส่วนนี้ถูกเก็บใน spec แต่ไม่ใส่ใน prompt (เปลี่ยนเป็น Veo 3 / Sora 2 เพื่อใช้เสียง)`}</div>`; }
  if (it.t === 'shots') return `<div class="group" data-sc="${s.c}"><div class="ghead"><span class="gtitle">🗂️ Multi-shot Storyboard</span><span class="gmeta">${state.shots.length} ช็อต · รวม ${shotSum()}s</span><span class="sp"></span><button class="btn sm" data-act="addShot">➕ เพิ่มช็อต</button></div>
     ${state.shots.length?`<div class="rowlist">${state.shots.map((x,i)=>`<div class="row"><input type="number" min="1" max="20" value="${x.d||2}" data-shot="${i}" data-k="d" title="วินาที">${optSel('shot',x.size,`data-shot="${i}" data-k="size"`)}${optSel('movement',x.mv,`data-shot="${i}" data-k="mv"`)}<input value="${esc(x.desc||'')}" placeholder="Shot ${i+1}: เกิดอะไรขึ้น" data-shot="${i}" data-k="desc"><button class="xbtn" data-delshot="${i}">✕</button></div>`).join('')}</div>`:'<span class="tag">ยังไม่มีช็อต — ไม่จำเป็นสำหรับคลิปช็อตเดียว เพิ่มเมื่อต้องการเล่าเรื่องหลายช็อตในคลิปเดียว</span>'}</div>`;
  if (it.t === 'dialogue') return `<div class="group" data-sc="${s.c}"><div class="ghead"><span class="gtitle">💬 บทพูด (Dialogue)</span><span class="sp"></span><button class="btn sm" data-act="addDlg">➕ เพิ่มบทพูด</button></div>
     ${state.dialogue.length?`<div class="rowlist dlg">${state.dialogue.map((d,i)=>`<div class="row"><input value="${esc(d.sp||'')}" placeholder="ผู้พูด" data-dlg="${i}" data-k="sp"><input value="${esc(d.line||'')}" placeholder="ข้อความที่พูด" data-dlg="${i}" data-k="line"><select data-dlg="${i}" data-k="tone">${['','softly','excitedly','whispering','shouting','sadly','confidently','sarcastically'].map(t=>`<option ${t===d.tone?'selected':''} value="${t}">${t||'— น้ำเสียง —'}</option>`).join('')}</select><label class="chk"><input type="checkbox" ${d.thai?'checked':''} data-dlg="${i}" data-k="thai">พูดไทย</label><button class="xbtn" data-deldlg="${i}">✕</button></div>`).join('')}</div>`:'<span class="tag">เพิ่มบทพูด เช่น ผู้พูด "The chef" · "Taste this!" · excitedly — ติ๊ก "พูดไทย" เพื่อให้ตัวละครพูดภาษาไทยโดยไม่แปล</span>'}</div>`;
  if (it.t === 'consistency') return `<div class="group" data-sc="${s.c}"><div class="ghead"><span class="gtitle">🧬 ความต่อเนื่อง (Consistency) & Seed</span></div>
     <div class="grid2"><div><div class="slabel">ชื่อตัวละครที่ล็อกไว้ (Character sheet)</div><input data-field="charName" placeholder="เช่น Mali, the orange tabby cat" value="${esc(state.charName)}"></div>
     <div><div class="slabel">Seed (ถ้าโมเดลรองรับ)</div><input data-field="seed" placeholder="เช่น 42" value="${esc(state.seed)}"></div></div>
     <div class="chkrow"><label class="chk"><input type="checkbox" data-flag="charRef" ${state.charRef?'checked':''}> ใช้ภาพอ้างอิงตัวละคร (image reference)</label>
     <label class="chk"><input type="checkbox" data-flag="autoNeg" ${state.autoNeg?'checked':''}> เพิ่ม negative อัตโนมัติตามสไตล์</label></div></div>`;
  return '';
}
function renderCenter() {
  const {bad} = evalConflicts();
  const hero = `<div class="hero"><h2>⚡ Quick-start จากไอเดีย</h2><p>พิมพ์ไอเดียเป็นประโยคเดียว (ไทยหรืออังกฤษ) แล้วระบบจะเติมตัวเลือกให้อัตโนมัติ — ${aiRoute('parse') ? `ใช้ AI: <b>${esc(routeLabel(aiRoute('parse')))}</b> แปลงเป็น structured spec (เลือกเฉพาะ option id ที่มีจริง)` : 'ตอนนี้ใช้ keyword matcher แบบออฟไลน์ — <a href="#" data-aiact="open" class="lnk m0">ตั้งค่า AI ⚙️</a> เพื่อให้ LLM วิเคราะห์ไอเดีย'}</p>
    <div class="qs"><input id="idea" placeholder="เช่น แมวส้มนั่งมองฝนตกริมหน้าต่างตอนกลางคืน โทนเย็น เหงาๆ กล้องดันเข้าช้าๆ" value="${esc(state.idea)}"><button class="btn pri" data-act="quick" ${ui.aiBusy && ui.aiBusy.parse ? 'disabled' : ''}>${ui.aiBusy && ui.aiBusy.parse ? '<span class="spin"></span> AI กำลังวิเคราะห์…' : quickLabel()}</button></div>${parseNote()}
    <div class="presets"><span class="lbl">หรือเริ่มจาก Preset:</span>${PRESETS.map(p=>`<button class="pchip ${state.preset===p.id?'on':''}" data-preset="${p.id}">${p.e} ${p.th}</button>`).join('')}</div></div>`;
  let body = '';
  if (ui.mode === 'wizard') {
    const s = STEPS[ui.step];
    body = `<div class="stephead" data-sc="${s.c}"><div><h1><span class="dot"></span>${s.e} ${s.th}</h1><p>${s.d}</p></div><span class="stepbadge">ขั้นที่ ${ui.step+1} / ${STEPS.length}</span></div>`
      + s.items.map(it => itemHTML(it, s, bad)).join('')
      + `<div class="wiznav"><button class="btn" data-act="prev" ${ui.step===0?'disabled':''}>← ก่อนหน้า</button><button class="btn pri" data-act="next">${ui.step===STEPS.length-1?'✅ เสร็จสิ้น — คัดลอก Prompt':'ถัดไป: '+STEPS[ui.step+1].e+' '+STEPS[ui.step+1].th+' →'}</button></div>`;
  } else {
    body = `<input class="search" id="search" placeholder="🔍 ค้นหาตัวเลือก เช่น dolly, นีออน, anime…" value="${esc(ui.search)}">` + STEPS.map(s => {
      const inner = s.items.map(it => itemHTML(it, s, bad)).join('');
      return inner ? `<div class="adv-step"><div class="stephead" data-sc="${s.c}"><div><h1 class="sm"><span class="dot"></span>${s.e} ${s.th}</h1><p>${s.d}</p></div></div>${inner}</div>` : '';
    }).join('');
  }
  const c = $('#center'); const sc = c.scrollTop;
  c.innerHTML = hero + body;
  c.scrollTop = sc;
  updateThFlags();
  if (ui.mode === 'advanced' && ui._focusSearch) { const si = $('#search'); si.focus(); si.setSelectionRange(si.value.length, si.value.length); ui._focusSearch = false; }
}

/* ============================================================
   10) RENDER — OUTPUT PANEL
   ============================================================ */
function markedToHTML(s) {
  // 1) highlight Thai runs first (markers contain only ASCII group ids, so they are never matched)
  let h = esc(s).replace(/[\u0E00-\u0E7F][\u0E00-\u0E7F\s\d.,!?]*/g, m => `<span class="thw" title="ต้องแปลเป็นอังกฤษ">${m}</span>`);
  // 2) then convert group markers to coloured spans
  return h.replace(/\u0001([^\u0002]*)\u0002/g, (m, g) => `<span class="pseg" data-sc="${(G2S[g] || STEPS[0]).c}" title="${esc((GROUPS[g] || {}).th || g)}">`).replace(/\u0003/g, '</span>');
}
function renderModels() {
  $('#models').innerHTML = MODELS.map(m => `<button class="model ${state.model===m.id?'on':''}" data-model="${m.id}"><b>${m.name}</b><span>${m.v}</span></button>`).join('');
  const m = MOD[state.model];
  $('#mnote').innerHTML = `${esc(m.note)}<div class="caps"><span class="cap ${m.audio===true?'y':m.audio?'p':'n'}">${m.audio===true?'🔊 เสียง':m.audio?'🔊 เสียง (บางเวอร์ชัน)':'🔇 ไม่มีเสียง'}</span><span class="cap ${m.neg==='field'?'y':m.neg==='inline'?'p':'n'}">${m.neg==='field'?'🚫 ช่อง negative':m.neg==='inline'?'🚫 negative แบบ inline':'🚫 ไม่มี negative'}</span><span class="cap">⏱️ ≤ ${m.dur}s</span><span class="cap">📏 แนะนำ ≤ ${m.max} ตัวอักษร</span></div>`;
}
function updatePreview() {
  const r = compile(); compileCache = r;
  const enh = state.enhanced && state.enhanced.model === state.model && state.enhanced.source === r.prompt ? state.enhanced : null;
  r.finalPrompt = enh ? enh.prompt : r.prompt; r.finalNeg = enh && enh.negative ? enh.negative : r.negative; r.enh = enh;
  const conf = evalConflicts(); const sc = score(conf);
  const pre = $('#prompt');
  if (ui.outTab === 'json') pre.innerHTML = esc(JSON.stringify(specJSON(), null, 2));
  else if (enh) pre.innerHTML = esc(enh.prompt);
  else pre.innerHTML = r.prompt ? markedToHTML(r.marked) : '<span class="empty">👈 เลือกตัวเลือก พิมพ์ไอเดีย หรือกด Preset เพื่อเริ่มสร้าง prompt — พรีวิวจะอัปเดตทันที</span>';
  const eb = $('#enhBanner');
  if (eb) eb.innerHTML = enh ? `<div class="enhbanner">✨ แสดง prompt ที่ AI ปรับแล้ว (${esc(enh.by)}) — Copy จะได้เวอร์ชันนี้<span class="sp"></span><button class="btn sm" data-aiact="unEnhance">↩︎ ใช้แบบ compile</button></div>`
    : state.enhanced ? `<div class="enhbanner stale">ℹ️ ตัวเลือก/โมเดลเปลี่ยนหลัง Enhance — แสดง prompt ที่ compile ใหม่<span class="sp"></span><button class="btn sm" data-aiact="enhance">✨ Enhance ใหม่</button></div>` : '';
  const n = r.finalPrompt.length, pct = Math.min(100, n / r.m.max * 100);
  $('#charCount').textContent = `${n.toLocaleString()} / ${r.m.max.toLocaleString()} ตัวอักษร (แนะนำ) · ~${r.finalPrompt.split(/\s+/).filter(Boolean).length} คำ`;
  const bar = $('#charBar'); bar.style.width = pct + '%'; bar.style.background = n > r.m.max ? 'var(--err)' : pct > 85 ? 'var(--warn)' : 'var(--ok)';
  $('#negMode').textContent = r.m.neg === 'field' ? 'วางในช่อง Negative prompt' : r.m.neg === 'inline' ? 'ใส่ใน prompt เป็น "Avoid:" แล้ว' : 'โมเดลนี้ไม่ใช้ negative';
  $('#neg').innerHTML = r.m.neg === 'field' ? (r.finalNeg ? esc(r.finalNeg) : '<span class="empty">ยังไม่มี — เลือกได้ในขั้น 🛡️</span>') : `<span class="empty">${r.m.neg==='inline'?'รวมอยู่ใน prompt แล้ว':'ถูกตัดออก'}: ${esc(r.negAll.join(', ') || '—')}</span>`;
  const p = paramsObj();
  $('#params').innerHTML = [['Aspect ratio', p.aspect_ratio], ['Duration', p.duration_s ? p.duration_s + 's' : '—'], ['FPS', p.fps || '—'], ['Seed', p.seed ?? '—'], ['Character ref', p.character_reference ? 'แนบภาพ' : '—'], ['Format', r.m.fmt]].map(([k, v]) => `<div class="param"><span>${k}</span><b>${esc(v)}</b></div>`).join('');
  const ring = $('#ring'); ring.style.setProperty('--p', sc.s);
  const col = sc.s >= 80 ? 'var(--ok)' : sc.s >= 50 ? 'var(--warn)' : 'var(--err)';
  ring.style.setProperty('--col', col);
  $('#scoreNum').innerHTML = `${sc.s}<small>/100</small>`;
  $('#scoreLabel').innerHTML = `ความครบถ้วน: <b data-fg="${col}">${sc.s>=80?'ดีมาก 🎉':sc.s>=50?'พอใช้ — เติมอีกนิด':'ยังขาดหลายส่วน'}</b>`;
  $('#missing').innerHTML = sc.miss.length ? sc.miss.map(x => `<button class="miss" data-goto="${x.go}">➕ ${x.th} <span class="muted">+${x.w}</span></button>`).join('') : '<span class="okline">✓ ครบทุกมิติสำคัญแล้ว</span>';
  const icon = {error:'⛔', warn:'⚠️', info:'ℹ️'};
  $('#conflicts').innerHTML = conf.list.length ? conf.list.map((c, i) => `<div class="cf ${c.lv}"><span>${icon[c.lv]}</span><span class="msg">${esc(c.msg)}</span>${c.fix?`<button class="fix" data-fix="${i}">🔧 ${esc(c.fix.label)}</button>`:''}</div>`).join('') : '<div class="cf info ok"><span>✅</span><span class="msg">ไม่พบความขัดแย้ง</span></div>';
  const ne = conf.list.filter(c => c.lv === 'error').length, nw = conf.list.filter(c => c.lv === 'warn').length;
  $('#cfCount').innerHTML = `<span class="c-err">${ne} error</span> · <span class="c-warn">${nw} warn</span>`;
  ui._conf = conf;
  $('#legend').innerHTML = STEPS.map(s => `<span data-sc="${s.c}"><i></i>${s.th.split(' ')[0]}</span>`).join('') + '<span><i class="tr"></i>ต้องแปล</span>';
  persist();
}
function renderAll() { renderNav(); renderCenter(); renderModels(); updatePreview(); }
/* ============================================================
   11) ACTIONS
   ============================================================ */
function toggle(g, id) {
  const G_ = GROUPS[g]; let cur = [...S(g)];
  if (cur.includes(id)) cur = cur.filter(x => x !== id);
  else if (!G_.max) cur = [id];
  else { if (cur.length >= G_.max) cur.shift(); cur.push(id); }
  state.sel[g] = cur; delete state.ai[g + '.' + id]; state.preset = null;
}
function applyFix(f) {
  if (f.act === 'translate') { if (aiRoute('translate')) translateNow(true); else openSettings(); return; }
  if (f.clear) state.sel[f.clear] = [];
  if (f.set) state.sel[f.set[0]] = [f.set[1]];
  if (f.rm) state.sel[f.rm[0]] = S(f.rm[0]).filter(x => x !== f.rm[1]);
  if (f.add) { const G_ = GROUPS[f.add[0]]; if (!G_.max) state.sel[f.add[0]] = [f.add[1]]; else if (!S(f.add[0]).includes(f.add[1])) state.sel[f.add[0]] = [...S(f.add[0]), f.add[1]].slice(-G_.max); }
  toast('🔧 แก้ไขแล้ว: ' + f.label); renderAll();
}
function kwMatch(text, k) {
  if (/^[\x00-\x7f]+$/.test(k)) return new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])', 'i').test(text);
  return text.includes(k);
}
function quickStartOffline() {
  const idea = (state.idea || '').trim();
  if (!idea) { toast('✏️ พิมพ์ไอเดียก่อน แล้วกด ✨ เติมตัวเลือก'); $('#idea').focus(); return; }
  setState(Object.assign(blank(), {model: state.model, idea: state.idea, locks: state.locks}));
  const text = idea.toLowerCase(); const found = [];
  for (const g in GROUPS) {
    const G_ = GROUPS[g]; let single = false;
    for (const o of G_.opts) {
      if (!o.kw || !o.kw.some(k => kwMatch(text, k.toLowerCase()))) continue;
      const cur = S(g); if (cur.includes(o.id)) continue;
      if (!G_.max) { if (single) continue; state.sel[g] = [o.id]; single = true; }
      else { if (cur.length >= G_.max) continue; state.sel[g] = [...cur, o.id]; }
      state.ai[g + '.' + o.id] = 1; found.push(o.e + ' ' + o.th);
    }
  }
  if (!state.subject.trim()) state.subject = idea;
  if (has('time', NIGHT) && !any('lighting')) { state.sel.lighting = ['moon']; state.ai['lighting.moon'] = 1; found.push('🌕 แสงจันทร์ (แนะนำ)'); }
  if (!any('style')) { state.sel.style = ['cinematic']; state.ai['style.cinematic'] = 1; found.push('🎬 Cinematic (ค่าเริ่มต้น)'); }
  state.preset = null;
  renderAll();
  toast(found.length ? `✨ เติม ${found.length} ตัวเลือก: ${found.slice(0, 6).join(', ')}${found.length > 6 ? '…' : ''}` : '🤔 ไม่พบคีย์เวิร์ดที่รู้จัก — ระบบจริงจะใช้ LLM วิเคราะห์');
}
function loadPreset(id) {
  ui.lastParse = null;
  const p = PRESETS.find(x => x.id === id); if (!p) return;
  const keepIdea = state.idea;
  setState(Object.assign(blank(), clone(p.s), {model: p.model, preset: p.id, idea: keepIdea}));
  state.sel = clone(p.s.sel); state.shots = clone(p.s.shots || []); state.dialogue = clone(p.s.dialogue || []);
  toast(`${p.e} โหลด Preset "${p.th}" → โมเดล ${MOD[p.model].name}`);
  renderAll();
}
function gotoGroup(g) {
  const s = G2S[g]; if (!s) return;
  if (ui.mode === 'wizard') { ui.step = STEPS.indexOf(s); renderNav(); renderCenter(); }
  requestAnimationFrame(() => {
    const f = document.querySelector(`[data-field="${g}"]`);
    const el = document.getElementById('g-' + g) || (f && f.closest('.group'));
    if (el) { el.scrollIntoView({behavior:'smooth', block:'center'}); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); }
  });
}
// ---- A/B Variations
const VAR_POOL = ['angle','movement','lighting','palette','lens','shot','time','mood'];
let lastVars = [];
function makeVariations(n = 3) {
  const pool = VAR_POOL.filter(g => !state.locks.includes(g));
  const out = [];
  for (let k = 0; k < n; k++) {
    const st = clone(state); const diffs = [];
    const picks = [...pool].sort(() => Math.random() - .5).slice(0, 2);
    picks.forEach(g => {
      const choices = GROUPS[g].opts.filter(o => !(st.sel[g] || []).includes(o.id));
      const o = choices[Math.floor(Math.random() * choices.length)]; if (!o) return;
      st.sel[g] = [o.id]; st.preset = null; diffs.push(`${GROUPS[g].th.split(' (')[0]} → ${o.e} ${o.th}`);
    });
    out.push({st, diffs, r: compile(st.model, st)});
  }
  return out;
}
function showVariations() {
  if (!compileCache.prompt) { toast('เลือกตัวเลือกหรือ Preset ก่อน'); return; }
  lastVars = makeVariations(3);
  openModal(`<h2>🎲 A/B Variations<span class="sp"></span><button class="btn sm" data-act="reroll">🔁 สุ่มใหม่</button>&nbsp;<button class="btn sm" data-act="close">✕</button></h2>
   <div class="sub">สลับ 2 มิติแบบสุ่ม (มุมกล้อง, การเคลื่อนกล้อง, แสง, โทนสี, เลนส์, ขนาดภาพ, เวลา, อารมณ์) — กลุ่มที่ 🔒 ล็อกไว้จะไม่ถูกเปลี่ยน · ล็อกอยู่: ${state.locks.length ? state.locks.map(g => GROUPS[g].th).join(', ') : 'ไม่มี'} · ระบบจริงมีโหมด LLM สร้าง variation เชิงสร้างสรรค์ด้วย</div>
   ${lastVars.map((v, i) => `<div class="var"><div class="vh"><b>${'ABC'[i]}</b>${v.diffs.map(d => `<span class="diff">${esc(d)}</span>`).join('')}<span class="sp"></span><button class="btn sm" data-copyvar="${i}">📋 Copy</button><button class="btn sm pri" data-usevar="${i}">ใช้แบบนี้</button></div><pre>${esc(v.r.prompt)}</pre></div>`).join('')}`);
}
// ---- History / versioning (localStorage)
const H_KEY = 'vpb_history';
const getHist = () => { try { return JSON.parse(localStorage.getItem(H_KEY) || '[]'); } catch(e) { return []; } };
function saveVersionLocal() {
  const h = getHist(); const sc = score(evalConflicts()).s;
  h.unshift({id: Date.now(), ts: new Date().toLocaleString('th-TH'), title: (state.subject || state.idea || 'ไม่มีชื่อ').slice(0, 70), model: state.model, score: sc, state: clone(state), prompt: compileCache.finalPrompt});
  try { localStorage.setItem(H_KEY, JSON.stringify(h.slice(0, 30))); } catch(e) {}
  toast(`💾 บันทึกเวอร์ชัน v${h.length} แล้ว (เก็บใน localStorage)`);
}
function showHistoryLocal() {
  const h = getHist();
  openModal(`<h2>🕘 ประวัติเวอร์ชัน<span class="sp"></span><button class="btn sm" data-act="close">✕</button></h2><div class="sub">เก็บในเบราว์เซอร์ (localStorage) สูงสุด 30 เวอร์ชัน — โหมดออฟไลน์ (ไม่ได้เชื่อมต่อ server)</div>
   ${h.length ? h.map((x, i) => `<div class="hist"><div class="hi"><b>v${h.length - i} · ${esc(x.title)}</b><span>${esc(x.ts)} · ${(MOD[x.model] || {}).name || x.model} · คะแนน ${x.score}</span></div><button class="btn sm" data-copyhist="${i}">📋</button><button class="btn sm pri" data-restore="${i}">↩︎ เรียกคืน</button><button class="btn sm" data-delhist="${i}">🗑️</button></div>`).join('') : '<div class="notice">ยังไม่มีเวอร์ชันที่บันทึก — กด 💾 บันทึกเวอร์ชัน</div>'}`);
}
function openModal(html, cls) { const mb = $('#mbox'); mb.className = 'mbox' + (cls ? ' ' + cls : ''); mb.innerHTML = html; $('#modal').classList.add('show'); }
function closeModal() { $('#modal').classList.remove('show'); }
function exportJSON() {
  const blob = new Blob([JSON.stringify({version:1, spec: specJSON(), state, compiled: {prompt: compileCache.finalPrompt, negative: compileCache.finalNeg, ai_enhanced: !!compileCache.enh}}, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'video-prompt-' + Date.now() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('⬇️ ดาวน์โหลด JSON แล้ว');
}
function syncMode() { document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === ui.mode)); }

/* ============================================================
   12) EVENTS (delegated)
   ============================================================ */
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) { if (e.target.id === 'modal') closeModal(); return; }
  const d = t.dataset;
  if (t.classList.contains('chip')) { toggle(d.g, d.id); renderNav(); renderCenter(); updatePreview(); return; }
  if (d.step !== undefined) { ui.mode = 'wizard'; ui.step = +d.step; syncMode(); renderNav(); renderCenter(); $('#center').scrollTop = 0; return; }
  if (d.model) { state.model = d.model; renderModels(); renderCenter(); updatePreview(); return; }
  if (d.preset) { loadPreset(d.preset); return; }
  if (d.lock) { state.locks = state.locks.includes(d.lock) ? state.locks.filter(x => x !== d.lock) : [...state.locks, d.lock]; renderCenter(); persist(); return; }
  if (d.clear) { state.sel[d.clear] = []; state.custom[d.clear] = ''; renderAll(); return; }
  if (d.goto) { gotoGroup(d.goto); return; }
  if (d.fix !== undefined) { applyFix(ui._conf.list[+d.fix].fix); return; }
  if (d.delshot !== undefined) { state.shots.splice(+d.delshot, 1); renderAll(); return; }
  if (d.deldlg !== undefined) { state.dialogue.splice(+d.deldlg, 1); renderAll(); return; }
  if (d.usevar !== undefined) { setState(lastVars[+d.usevar].st); closeModal(); renderAll(); toast('✅ ใช้ Variation ' + 'ABC'[+d.usevar] + ' แล้ว'); return; }
  if (d.copyvar !== undefined) { copyText(lastVars[+d.copyvar].r.prompt, ' Variation '); return; }
  if (d.restore !== undefined) { setState(Object.assign(blank(), getHist()[+d.restore].state)); closeModal(); renderAll(); toast('↩︎ เรียกคืนเวอร์ชันแล้ว'); return; }
  if (d.copyhist !== undefined) { copyText(getHist()[+d.copyhist].prompt, ' prompt '); return; }
  if (d.delhist !== undefined) { const h = getHist(); h.splice(+d.delhist, 1); localStorage.setItem(H_KEY, JSON.stringify(h)); showHistory(); return; }
  if (d.mode) { ui.mode = d.mode; syncMode(); renderNav(); renderCenter(); return; }
  if (d.t) { ui.outTab = d.t; document.querySelectorAll('#outTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === d.t)); updatePreview(); return; }
  switch (d.act) {
    case 'quick': quickStart(); return;
    case 'prev': if (ui.step > 0) { ui.step--; renderNav(); renderCenter(); $('#center').scrollTop = 0; } return;
    case 'next': if (ui.step < STEPS.length - 1) { ui.step++; renderNav(); renderCenter(); $('#center').scrollTop = 0; } else copyText(compileCache.finalPrompt, ' prompt '); return;
    case 'addShot': state.shots.push({d: 2, size: '', mv: '', desc: ''}); renderAll(); return;
    case 'addDlg': state.dialogue.push({sp: '', line: '', tone: '', thai: false}); renderAll(); return;
    case 'close': closeModal(); return;
    case 'reroll': showVariations(); return;
    case 'copyReq': copyText(JSON.stringify(ui._req, null, 2), ' request '); return;
  }
  switch (t.id) {
    case 'copyPrompt': copyText(ui.outTab === 'json' ? JSON.stringify(specJSON(), null, 2) : compileCache.finalPrompt, ui.outTab === 'json' ? ' JSON ' : ' prompt '); break;
    case 'copyNeg': copyText(compileCache.finalNeg || compileCache.negAll.join(', '), ' negative '); break;
    case 'copyAll': { const p = paramsObj(); copyText(`PROMPT:\n${compileCache.finalPrompt}\n\nNEGATIVE:\n${compileCache.finalNeg || '(n/a)'}\n\nPARAMS: aspect ${p.aspect_ratio} · ${p.duration_s || '-'}s · fps ${p.fps || '-'} · seed ${p.seed ?? '-'}`, 'ทั้งหมด'); break; }
    case 'btnVar': showVariations(); break;
    case 'btnEnhance': runEnhance(); break;
    case 'btnSave': saveVersion(); break;
    case 'btnHistory': showHistory(); break;
    case 'btnExport': exportJSON(); break;
    case 'btnImport': $('#fileIn').click(); break;
    case 'btnCopyTh': copyText(thaiSummary(), 'สรุปภาษาไทย'); break;
    case 'btnReset': if (confirm('ล้างตัวเลือกทั้งหมดและเริ่มใหม่?')) { setState(blank()); ui.step = 0; renderAll(); } break;
  }
});
document.addEventListener('input', e => {
  const t = e.target, d = t.dataset;
  if (t.id === 'idea') { state.idea = t.value; persist(); return; }
  if (t.id === 'search') { ui.search = t.value; ui._focusSearch = true; renderCenter(); return; }
  if (t.type === 'checkbox') return; // handled in change
  if (d.field) state[d.field] = t.value;
  else if (d.custom) state.custom[d.custom] = t.value;
  else if (d.shot !== undefined) state.shots[+d.shot][d.k] = d.k === 'd' ? (+t.value || 1) : t.value;
  else if (d.dlg !== undefined) state.dialogue[+d.dlg][d.k] = t.value;
  else return;
  updatePreview(); renderNav(); updateThFlags(); scheduleTranslate();
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (t.type === 'checkbox') {
    if (d.flag) state[d.flag] = t.checked;
    else if (d.dlg !== undefined) state.dialogue[+d.dlg].thai = t.checked;
    else return;
    updatePreview();
  } else if (t.tagName === 'SELECT' && (d.shot !== undefined || d.dlg !== undefined)) {
    if (d.shot !== undefined) state.shots[+d.shot][d.k] = t.value; else state.dialogue[+d.dlg][d.k] = t.value;
    updatePreview();
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); if (e.key === 'Enter' && e.target.id === 'idea' && !(ui.aiBusy && ui.aiBusy.parse)) quickStart(); });
document.getElementById('fileIn').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(t => { try { const j = JSON.parse(t); setState(Object.assign(blank(), j.state || {})); renderAll(); toast('⬆️ นำเข้า JSON แล้ว'); } catch(err) { toast('❌ ไฟล์ JSON ไม่ถูกต้อง'); } });
  e.target.value = '';
});


/* ============================================================
   13) AI — server-backed (keys + system prompts live on the API server)
   ============================================================ */
const AI_TASKS = {enhance:{th:'✨ AI Enhance (ขัดเกลา prompt)'}, translate:{th:'🌐 แปลไทย → อังกฤษ'}, parse:{th:'⚡ Quick-start (แยกไอเดีย)'}};
const PROV_E = {openai:'🟢', gemini:'🔷', anthropic:'🟠', xai:'⚫', openrouter:'🔀', ollama:'🦙', custom:'🛠️'};
let AIS = null;                       // GET /ai/settings → {settings, providers[], routes, policy, quota}
const TR_LOCAL = 'vpb_tr_cache';      // local mirror of server translations (offline display)
try { Object.assign(trCache, JSON.parse(localStorage.getItem(TR_LOCAL) || '{}')); } catch(e) {}
const saveTrLocal = () => { try { localStorage.setItem(TR_LOCAL, JSON.stringify(trCache)); } catch(e) {} };
const trPending = new Set();
const provName = id => (AIS && (AIS.providers.find(p => p.id === id) || {}).name) || id;
function aiRoute(task) { if (OFFLINE || !AIS || !AIS.routes[task]) return null; const r = AIS.routes[task]; return {pid: r.provider, model: r.model, task}; }
const routeLabel = r => r ? `${provName(r.pid)} · ${r.model}` : 'ออฟไลน์';
async function loadAI() {
  if (OFFLINE) { AIS = null; return; }
  try { AIS = await api.get('/ai/settings'); } catch(e) { AIS = null; }
  C.hooks.canTranslate = () => !!aiRoute('translate');
  renderAIChip();
}
const errMsg = e => (e && e.message) || String(e);

/* ---- Translate (POST /ai/translate, cached on the server) ---- */
function pendingThai() {
  const out = new Set();
  const add = v => { const k = String(v || '').trim(); if (k && isTh(k) && !trCache[k] && !trPending.has(k)) out.add(k); };
  ['subject','scene_detail','style_ref','vo','neg_custom'].forEach(f => add(state[f]));
  Object.values(state.custom || {}).forEach(add);
  state.shots.forEach(s => add(s.desc));
  state.dialogue.forEach(d => { if (!d.thai) add(d.line); });
  return [...out];
}
let trTimer = null;
function scheduleTranslate() { clearTimeout(trTimer); if (AIS && AIS.settings.autoTranslate && aiRoute('translate') && pendingThai().length) trTimer = setTimeout(() => translateNow(false), 1200); }
async function translateNow(manual) {
  const items = pendingThai();
  if (!items.length) { if (manual) toast('ไม่มีข้อความภาษาไทยที่ยังไม่ได้แปล'); return; }
  if (OFFLINE) { if (manual) toast('📴 โหมดออฟไลน์ — แปลด้วย AI ไม่ได้'); return; }
  items.forEach(k => trPending.add(k)); setBusy('translate', true); updateThFlags();
  try {
    const r = await api.post('/ai/translate', {texts: items});
    Object.assign(trCache, r.translations); saveTrLocal();
    if (r.missing.length && !r.route) toast(`⚙️ ยังไม่ได้ตั้งค่า AI สำหรับงานแปล (แปลจาก cache ได้ ${r.cached} ข้อความ)`);
    else toast(`🌐 แปลแล้ว ${r.cached + r.translated}/${items.length} ข้อความ${r.cached ? ` (cache ${r.cached})` : ''}${r.route ? ' · ' + routeLabel({pid: r.route.provider, model: r.route.model}) : ''}`);
  } catch(e) { toast('❌ แปลไม่สำเร็จ: ' + errMsg(e)); }
  finally { items.forEach(k => trPending.delete(k)); setBusy('translate', false); updateThFlags(); updatePreview(); }
}
function updateThFlags() {
  document.querySelectorAll('[data-thflag]').forEach(el => {
    const v = String(state[el.dataset.thflag] || '').trim();
    const th = isTh(v); el.classList.toggle('show', th);
    if (!th) return;
    if (trCache[v]) { el.className = 'thflag show ok'; el.textContent = '✅ แปลแล้ว → ' + trCache[v]; }
    else if (trPending.has(v)) { el.className = 'thflag show'; el.textContent = '⏳ กำลังแปลด้วย AI…'; }
    else { el.className = 'thflag show'; el.textContent = aiRoute('translate') ? '🇹🇭 พบภาษาไทย — จะแปลอัตโนมัติเมื่อหยุดพิมพ์ (หรือกด 🌐 แปลด้วย AI)' : '🇹🇭 พบภาษาไทย — ตั้งค่า AI (⚙️) เพื่อแปลอัตโนมัติ'; }
  });
}

/* ---- Quick-start parse-idea (POST /ai/parse-idea) ---- */
async function quickStart() {
  const idea = (state.idea || '').trim();
  if (!idea) { toast('✏️ พิมพ์ไอเดียก่อน แล้วกด ✨ เติมตัวเลือก'); $('#idea').focus(); return; }
  if (!aiRoute('parse')) { ui.lastParse = {offline: true}; quickStartOffline(); return; }
  setBusy('parse', true);
  try {
    const r = await api.post('/ai/parse-idea', {idea, model: state.model});
    setState(Object.assign(blank(), {model: state.model, idea: state.idea, locks: state.locks}));
    state.sel = r.patch.sel; state.ai = r.patch.ai; state.custom = r.patch.custom;
    state.subject = r.patch.subject; state.scene_detail = r.patch.scene_detail;
    ui.lastParse = {n: r.count, ignored: r.ignored, notes: r.notes_th, label: routeLabel({pid: r.provider, model: r.model}), ms: r.ms};
    setBusy('parse', false); renderAll();
    toast(`✨ AI เลือก ${r.count} ตัวเลือก${r.ignored.length ? ` · ข้าม ${r.ignored.length} id ที่ไม่รู้จัก` : ''} · ${r.ms}ms`);
  } catch(e) {
    setBusy('parse', false); ui.lastParse = {error: errMsg(e)};
    toast('⚠️ AI วิเคราะห์ไม่สำเร็จ — ใช้ keyword matcher แบบออฟไลน์แทน: ' + errMsg(e));
    quickStartOffline();
  }
}
function parseNote() {
  const p = ui.lastParse; if (!p || p.offline) return '';
  if (p.error) return `<div class="pnote err">⚠️ AI วิเคราะห์ไม่สำเร็จ (${esc(p.error)}) — ใช้ keyword matcher ออฟไลน์แทน</div>`;
  return `<div class="pnote">✨ <b>${esc(p.label)}</b> เลือก ${p.n} ตัวเลือก · ${p.ms}ms${p.ignored.length ? ` · ข้าม id ที่ไม่รู้จัก/เกินจำนวน: <code>${esc(p.ignored.join(', '))}</code>` : ''}${p.notes ? `<br>📝 ${esc(p.notes)}` : ''}</div>`;
}

/* ---- AI Enhance (POST /ai/enhance — server compiles the spec itself) ---- */
let lastEnh = null;
async function runEnhance() {
  if (!aiRoute('enhance')) { showEnhanceOffline(); return; }
  if (!compileCache.prompt) { toast('เลือกตัวเลือกหรือ Preset ก่อน'); return; }
  const m = MOD[state.model];
  openModal(`<h2>✨ AI Enhance<span class="sp"></span><button class="btn sm" data-act="close">✕</button></h2><div class="aiwait"><span class="spin"></span> กำลังเรียก <b>${esc(routeLabel(aiRoute('enhance')))}</b> ผ่าน server เพื่อขัดเกลา prompt สำหรับ ${esc(m.name)}…</div>`, 'wide');
  setBusy('enhance', true);
  try {
    const r = await api.post('/ai/enhance', {spec: state, model: state.model, projectId: PROJ.id || undefined});
    lastEnh = {prompt: r.prompt, negative: r.negative, explanation: r.explanation_th, changes: r.changes_th, source: r.source, model: r.model,
      by: routeLabel({pid: r.provider, model: r.llmModel}), ms: r.ms, warns: r.warnings};
    if (lastEnh.source !== compileCache.prompt) lastEnh.warns.push('prompt ฝั่ง server ต่างจากพรีวิว (อาจเพราะคำแปลใน cache)');
    showEnhanceResult();
  } catch(e) {
    openModal(`<h2>✨ AI Enhance<span class="sp"></span><button class="btn sm" data-act="close">✕</button></h2><div class="testres err">❌ ${esc(errMsg(e))}</div>
      <div class="sub mt10">prompt เดิมยังใช้งานได้ตามปกติ · ตรวจ API key / โมเดล ใน ⚙️ ตั้งค่า AI${e.code ? ` · code: <code>${esc(e.code)}</code>` : ''}</div>
      <div class="mactions"><button class="btn" data-aiact="open">⚙️ ตั้งค่า AI</button><button class="btn pri" data-aiact="enhance">🔁 ลองใหม่</button></div>`, 'wide');
  } finally { setBusy('enhance', false); }
}
function showEnhanceResult() {
  const x = lastEnh; if (!x) return;
  openModal(`<h2>✨ AI Enhance — ผลลัพธ์<span class="sp"></span><span class="aichip static">🤖 ${esc(x.by)} · ${x.ms}ms</span>&nbsp;<button class="btn sm" data-act="close">✕</button></h2>
   <div class="enhx"><b>💡 คำอธิบาย:</b> ${esc(x.explanation || '—')}${x.changes.length ? `<ul>${x.changes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}</div>
   ${x.warns.length ? `<div class="notice warn">⚠️ ${esc(x.warns.join(' · '))}</div>` : ''}
   <div class="enhgrid"><div><div class="slabel">ก่อน (compile จากตัวเลือก) · ${x.source.length} ตัวอักษร</div><pre class="prompt">${esc(x.source)}</pre></div>
   <div><div class="slabel">หลัง (AI Enhanced) · ${x.prompt.length} ตัวอักษร</div><pre class="prompt enh">${esc(x.prompt)}</pre></div></div>
   ${x.negative ? `<div class="slabel mt10">Negative ที่ปรับแล้ว</div><pre class="prompt neg">${esc(x.negative)}</pre>` : ''}
   <div class="mactions"><button class="btn" data-aiact="enhance">🔁 Enhance อีกครั้ง</button><button class="btn" data-aiact="copyEnh">📋 Copy</button><button class="btn pri" data-aiact="applyEnh">✅ ใช้ prompt นี้</button></div>`, 'wide');
}
function showEnhanceOffline() {
  openModal(`<h2>✨ AI Enhance (ยังไม่ได้เชื่อมต่อ AI)<span class="sp"></span><button class="btn sm" data-act="close">✕</button></h2>
   <div class="sub">${OFFLINE ? '📴 โหมดออฟไลน์ (ไม่ได้เชื่อมต่อ server) — ฟีเจอร์ AI ใช้ไม่ได้' : 'ยังไม่ได้เลือกผู้ให้บริการ AI สำหรับงาน Enhance — ไปที่ <b>⚙️ ตั้งค่า AI</b> เพื่อใส่ API key (OpenAI / Gemini / Claude / Grok / OpenRouter / Ollama / Custom) หรือให้ผู้ดูแลตั้ง key ของ server ใน .env'}</div>
   <div class="mactions"><button class="btn" data-act="close">ปิด</button>${OFFLINE ? '' : '<button class="btn pri" data-aiact="open">⚙️ ตั้งค่า AI</button>'}</div>`);
}

/* ---- Busy state + header chip ---- */
ui.aiBusy = {};
function setBusy(k, v) {
  ui.aiBusy[k] = v;
  const q = document.querySelector('[data-act="quick"]');
  if (q) { q.disabled = !!ui.aiBusy.parse; q.innerHTML = ui.aiBusy.parse ? '<span class="spin"></span> AI กำลังวิเคราะห์…' : quickLabel(); }
  const eb = $('#btnEnhance'); if (eb) { eb.disabled = !!ui.aiBusy.enhance; eb.innerHTML = ui.aiBusy.enhance ? '<span class="spin"></span> กำลัง Enhance…' : '✨ AI Enhance'; }
  renderAIChip();
}
const quickLabel = () => aiRoute('parse') ? '✨ เติมตัวเลือกด้วย AI' : '✨ เติมตัวเลือก';
function renderAIChip() {
  const el = $('#aiChip'); if (!el) return;
  const busy = Object.values(ui.aiBusy || {}).some(Boolean);
  const r = aiRoute('enhance') || aiRoute('parse') || aiRoute('translate');
  el.className = 'aichip ' + (r ? 'on' : 'off');
  el.innerHTML = busy ? '<span class="spin"></span> AI กำลังทำงาน…' : r ? `🤖 ${esc(routeLabel(r).replace(/ \(.*?\)/, ''))}` : OFFLINE ? '📴 ออฟไลน์ (ไม่มี server)' : '📴 AI: ออฟไลน์';
  el.title = Object.keys(AI_TASKS).map(t => AI_TASKS[t].th + ': ' + routeLabel(aiRoute(t))).join('\n');
}

/* ---- Settings modal (draft → PUT /ai/settings) ---- */
ui.aiTest = {};
function draftFromStatus(s) {
  const providers = {};
  s.providers.forEach(p => { providers[p.id] = {baseUrl: p.baseUrl, model: p.model, temperature: p.temperature ?? '', maxTokens: p.maxTokens}; });
  return {defaultProvider: s.settings.defaultProvider || '', tasks: clone(s.settings.tasks), autoTranslate: s.settings.autoTranslate, providers};
}
function draftReady(id) {
  const p = AIS.providers.find(x => x.id === id), d = ui.aiDraft.providers[id];
  const key = d.apiKey === null ? false : !!(d.apiKey || p.hasUserKey || p.hasServerKey);
  return !!(d.model && (d.baseUrl || p.baseUrl) && (!p.keyRequired || key));
}
function draftRoute(task) {
  const s = ui.aiDraft, t = s.tasks[task];
  const pid = t.provider === 'default' ? (s.defaultProvider || (AIS.policy.serverDefault || '')) : t.provider;
  if (!pid || pid === 'offline' || !draftReady(pid)) return null;
  return {pid, model: t.model || s.providers[pid].model};
}
function testResHTML(t) {
  if (!t) return '';
  if (t.busy) return '<div class="testres busy"><span class="spin"></span> กำลังทดสอบการเชื่อมต่อ (ผ่าน server)…</div>';
  if (t.ok) return `<div class="testres ok">✅ <b>เชื่อมต่อสำเร็จ</b> · ${t.ms}ms · ${esc(t.label)} · key: ${esc(t.keySource)}${t.reply ? ` · ตอบว่า: "${esc(t.reply)}"` : ' · (โมเดลตอบว่าง แต่ API ใช้งานได้)'}</div>`;
  return `<div class="testres err">❌ <b>เชื่อมต่อไม่สำเร็จ</b> — ${esc(t.msg)}${t.code ? ` <code>${esc(t.code)}</code>` : ''}</div>`;
}
function provOpts(v, task) {
  const head = task ? `<option value="default" ${v === 'default' ? 'selected' : ''}>↳ ใช้ค่าเริ่มต้น</option><option value="offline" ${v === 'offline' ? 'selected' : ''}>📴 ปิด AI สำหรับงานนี้ (ออฟไลน์)</option>`
                    : `<option value="" ${!v ? 'selected' : ''}>📴 ไม่ใช้ AI (ออฟไลน์)${AIS.policy.serverDefault ? ' / ค่าเริ่มต้นของ server' : ''}</option>`;
  return head + AIS.providers.map(p => `<option value="${p.id}" ${v === p.id ? 'selected' : ''}>${PROV_E[p.id] || ''} ${esc(p.name)}${draftReady(p.id) ? '' : ' (ยังไม่ตั้งค่า)'}</option>`).join('');
}
function plistHTML() {
  const s = ui.aiDraft;
  return AIS.providers.map(p => {
    const t = ui.aiTest[p.id], ready = draftReady(p.id);
    const dot = t && !t.busy ? (t.ok ? 'ok' : 'err') : ready ? 'ready' : '';
    return `<button class="pv ${p.id === ui.aiTab ? 'on' : ''}" data-aitab="${p.id}"><span class="pe">${PROV_E[p.id] || ''}</span><span class="pn">${esc(p.name)}${s.defaultProvider === p.id ? '<i class="def">★ ค่าเริ่มต้น</i>' : ''}${p.hasServerKey ? '<i class="def srv">🔑 key ของ server</i>' : ''}</span><span class="pdot ${dot}"></span></button>`;
  }).join('') + '<div class="tag mt6 lh16">🟡 ตั้งค่าแล้ว · 🟢 ทดสอบผ่าน · 🔴 ทดสอบไม่ผ่าน</div>';
}
async function openSettings() {
  if (OFFLINE) { toast('📴 โหมดออฟไลน์ — ตั้งค่า AI ได้เมื่อเชื่อมต่อ server'); return; }
  openModal('<div class="aiwait"><span class="spin"></span> กำลังโหลดการตั้งค่า…</div>', 'wide');
  try { AIS = await api.get('/ai/settings'); } catch(e) { openModal(`<div class="testres err">❌ โหลดการตั้งค่าไม่ได้: ${esc(errMsg(e))}</div>`); return; }
  ui.aiDraft = draftFromStatus(AIS); ui.aiTab = ui.aiTab || AIS.settings.defaultProvider || 'openai'; renderSettings();
}
function renderSettings() {
  const s = ui.aiDraft, pid = ui.aiTab, P = AIS.providers.find(p => p.id === pid), c = s.providers[pid], pol = AIS.policy;
  const keyState = c.apiKey === null ? '🗑️ จะลบ key ส่วนตัวเมื่อกดบันทึก' : c.apiKey ? '✏️ key ใหม่ (จะเข้ารหัสเมื่อบันทึก)' : P.hasUserKey ? `🔒 บันทึกแล้ว (เข้ารหัสที่ server): <code>${esc(P.userKeyHint)}</code>` : P.hasServerKey ? '🔑 ใช้ key ของ server (จาก .env)' : P.keyRequired ? 'ยังไม่มี key' : 'ไม่ต้องใช้ key';
  const form = `
   <div class="pfh"><span class="pe big">${PROV_E[pid] || ''}</span><div><b class="pname">${esc(P.name)}</b><div class="tag pfnote">${esc(P.note)}</div></div></div>
   <label class="fl">API key ${P.keyRequired ? '<span class="req">จำเป็น</span>' : '<span class="tag">(ไม่บังคับ)</span>'}${P.keyUrl ? `<a href="${P.keyUrl}" target="_blank" rel="noopener" class="lnk">ขอ API key ↗</a>` : ''}</label>
   ${pol.allowUserKeys ? `<div class="keyrow"><input type="password" autocomplete="off" spellcheck="false" data-ai="providers.${pid}.apiKey" id="aikey-${pid}" value="${esc(c.apiKey || '')}" placeholder="${P.hasUserKey ? 'เว้นว่าง = ใช้ key เดิม' : 'วาง API key ที่นี่'}"><button class="btn sm" data-aieye="${pid}" type="button">👁 แสดง</button>${P.hasUserKey ? `<button class="btn sm" data-aiact="delKey" type="button">🗑️</button>` : ''}</div>` : '<div class="tag">ผู้ดูแลระบบปิดการใช้ key ส่วนตัว (ALLOW_USER_KEYS=false)</div>'}
   <div class="tag mt6" id="aikeystate">${keyState}</div>
   <label class="fl">Base URL ${pol.allowUserBaseUrl ? `<button class="ib" data-aiact="resetUrl" type="button">↺ ค่าเริ่มต้น</button>` : '<span class="tag">(กำหนดโดย server)</span>'}</label>
   <input data-ai="providers.${pid}.baseUrl" id="aiurl-${pid}" value="${esc(c.baseUrl)}" spellcheck="false" ${pol.allowUserBaseUrl ? '' : 'readonly class="ro"'}>
   <label class="fl">โมเดล <span class="tag">(เลือกจากรายการหรือพิมพ์เอง)</span></label>
   <input list="dl-${pid}" data-ai="providers.${pid}.model" id="aimodel-${pid}" value="${esc(c.model)}" placeholder="พิมพ์ชื่อโมเดล" spellcheck="false"><datalist id="dl-${pid}">${P.models.map(m => `<option value="${m}">`).join('')}</datalist>
   <div class="mchips">${P.models.map(m => `<button class="mchip ${m === c.model ? 'on' : ''}" data-aimodel="${m}" type="button">${m}</button>`).join('') || '<span class="tag">พิมพ์ชื่อโมเดลของเซิร์ฟเวอร์คุณ</span>'}</div>
   <div class="grid2"><div><label class="fl">Temperature <span class="tag">(ว่าง = ค่าเริ่มต้น)</span></label><input type="number" min="0" max="2" step="0.1" data-ai="providers.${pid}.temperature" value="${esc(c.temperature ?? '')}" placeholder="default"></div>
   <div><label class="fl">Max tokens</label><input type="number" min="16" max="32000" step="1" data-ai="providers.${pid}.maxTokens" value="${esc(c.maxTokens)}"></div></div>
   <div class="testrow"><button class="btn pri" data-aitest="${pid}" type="button">🔌 ทดสอบการเชื่อมต่อ</button><button class="btn" data-aiact="setDefault" type="button">${s.defaultProvider === pid ? '★ เป็นค่าเริ่มต้นแล้ว' : '⭐ ตั้งเป็นค่าเริ่มต้น'}</button></div>
   <div id="aitest-${pid}">${testResHTML(ui.aiTest[pid])}</div>`;
  const side = `
   <div class="sbox"><h4>🧭 กำหนด AI ต่องาน (Per-task routing)</h4>
    <label class="fl mt0">ผู้ให้บริการค่าเริ่มต้น</label><select data-ai="defaultProvider">${provOpts(s.defaultProvider, false)}</select>
    ${Object.keys(AI_TASKS).map(t => `<div class="taskrow"><div class="tname">${AI_TASKS[t].th}</div><select data-ai="tasks.${t}.provider">${provOpts(s.tasks[t].provider, true)}</select><input data-ai="tasks.${t}.model" value="${esc(s.tasks[t].model)}" placeholder="โมเดลเฉพาะงานนี้ (ว่าง = ของผู้ให้บริการ)" spellcheck="false"><div class="tag" id="route-${t}">→ ${esc(routeLabel(draftRoute(t)))}</div></div>`).join('')}
    <label class="chk mt10"><input type="checkbox" data-ai="autoTranslate" ${s.autoTranslate ? 'checked' : ''}> แปลข้อความไทยอัตโนมัติเมื่อหยุดพิมพ์ (cache ที่ server)</label>
   </div>
   <div class="sbox"><h4>📊 โควตาวันนี้</h4><div class="tag lh16">ใช้ไป <b>${AIS.quota.used}</b> / ${AIS.quota.limit} ครั้ง (รีเซ็ตทุกวัน · กำหนดโดย LLM_DAILY_QUOTA) · cache hit ของคำแปลไม่นับโควตา</div></div>`;
  const mb = $('#mbox'); const st = mb.scrollTop;
  openModal(`<h2>⚙️ ตั้งค่า AI<span class="sp"></span><button class="btn sm" data-act="close">✕</button></h2>
   <div class="sub">เลือกผู้ให้บริการ AI สำหรับ ✨ Enhance, 🌐 แปลไทย→อังกฤษ และ ⚡ Quick-start — ทุกคำขอวิ่งผ่าน backend (system prompt อยู่ที่ server) · ถ้าไม่ได้ตั้งค่า ระบบจะทำงานแบบออฟไลน์</div>
   <div class="notice safe">🔐 API key ที่ใส่ที่นี่จะถูกส่งไปเก็บที่ server แบบ<b>เข้ารหัส AES-256-GCM</b> และ<b>ไม่ถูกส่งกลับมาที่เบราว์เซอร์อีก</b> (แสดงแค่ตัวย่อ) · ถ้าผู้ดูแลตั้ง key ใน .env ของ server ไว้แล้ว ไม่ต้องใส่ key เอง</div>
   <div class="setgrid"><div class="plist" id="aiPlist">${plistHTML()}</div><div class="pform">${form}</div><div class="pside">${side}</div></div>
   <div class="mfoot"><button class="btn" data-aiact="clearKeys" type="button">🗑️ ล้าง API keys ทั้งหมด</button><button class="btn" data-aiact="resetAll" type="button">↺ รีเซ็ตการตั้งค่า</button><span class="sp"></span><button class="btn" data-act="close">ยกเลิก</button><button class="btn pri" data-aiact="save" type="button">💾 บันทึก</button></div>`, 'wide');
  mb.scrollTop = st;
}
function refreshSettingsLive() {
  const pl = $('#aiPlist'); if (pl) pl.innerHTML = plistHTML();
  Object.keys(AI_TASKS).forEach(t => { const el = $('#route-' + t); if (el) el.textContent = '→ ' + routeLabel(draftRoute(t)); });
}
function setPath(o, path, v) { const ks = path.split('.'); let x = o; for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]]; x[ks[ks.length - 1]] = v; }
function settingsPayload() {
  const d = clone(ui.aiDraft); const out = {defaultProvider: d.defaultProvider, tasks: d.tasks, autoTranslate: d.autoTranslate, providers: {}};
  for (const id in d.providers) {
    const p = d.providers[id], o = {model: p.model || '', maxTokens: +p.maxTokens || 4096, temperature: p.temperature === '' || p.temperature === null ? null : +p.temperature};
    if (AIS.policy.allowUserBaseUrl) o.baseUrl = p.baseUrl || '';
    if (p.apiKey === null || (typeof p.apiKey === 'string' && p.apiKey.trim())) o.apiKey = p.apiKey === null ? null : p.apiKey.trim();
    out.providers[id] = o;
  }
  return out;
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-aiact],[data-aitab],[data-aitest],[data-aimodel],[data-aieye]'); if (!t) return;
  const d = t.dataset; if (t.tagName === 'A') e.preventDefault();
  if (d.aitab) { ui.aiTab = d.aitab; renderSettings(); return; }
  if (d.aimodel) { ui.aiDraft.providers[ui.aiTab].model = d.aimodel; renderSettings(); return; }
  if (d.aieye) { const i = $('#aikey-' + d.aieye); i.type = i.type === 'password' ? 'text' : 'password'; t.textContent = i.type === 'password' ? '👁 แสดง' : '🙈 ซ่อน'; return; }
  if (d.aitest) {
    const pid = d.aitest, c = ui.aiDraft.providers[pid]; ui.aiTest[pid] = {busy: true}; $('#aitest-' + pid).innerHTML = testResHTML(ui.aiTest[pid]); t.disabled = true;
    const draft = {model: c.model, maxTokens: +c.maxTokens || undefined, temperature: c.temperature === '' ? undefined : +c.temperature};
    if (AIS.policy.allowUserBaseUrl && c.baseUrl) draft.baseUrl = c.baseUrl;
    if (typeof c.apiKey === 'string' && c.apiKey.trim()) draft.apiKey = c.apiKey.trim();
    try { const r = await api.post('/ai/test', {provider: pid, draft}); ui.aiTest[pid] = {ok: true, ms: r.ms, label: routeLabel({pid, model: r.model}), reply: r.reply, keySource: r.keySource}; }
    catch(err) { ui.aiTest[pid] = {ok: false, msg: errMsg(err), code: err.code}; }
    const box = $('#aitest-' + pid); if (box) box.innerHTML = testResHTML(ui.aiTest[pid]);
    refreshSettingsLive(); t.disabled = false; return;
  }
  switch (d.aiact) {
    case 'open': openSettings(); return;
    case 'save': {
      t.disabled = true;
      try { AIS = await api.put('/ai/settings', settingsPayload()); closeModal(); renderAIChip(); renderCenter(); updatePreview(); scheduleTranslate();
        toast('💾 บันทึกการตั้งค่า AI แล้ว · ' + (aiRoute('enhance') || aiRoute('parse') || aiRoute('translate') ? 'AI พร้อมใช้งาน' : 'โหมดออฟไลน์')); }
      catch(err) { toast('❌ บันทึกไม่สำเร็จ: ' + errMsg(err)); t.disabled = false; }
      return;
    }
    case 'delKey': ui.aiDraft.providers[ui.aiTab].apiKey = null; renderSettings(); return;
    case 'clearKeys':
      if (!confirm('ลบ API key ส่วนตัวทั้งหมดออกจาก server?')) return;
      try { const r = await api.del('/ai/keys'); AIS = await api.get('/ai/settings'); ui.aiDraft = draftFromStatus(AIS); ui.aiTest = {}; renderSettings(); renderAIChip(); renderCenter(); updatePreview(); toast(`🗑️ ลบ API keys แล้ว (${r.deleted})`); }
      catch(err) { toast('❌ ' + errMsg(err)); }
      return;
    case 'resetAll': if (!confirm('รีเซ็ตการตั้งค่า AI (routing/โมเดล) เป็นค่าเริ่มต้น? (มีผลเมื่อกดบันทึก — key ที่บันทึกไว้ไม่ถูกลบ)')) return;
      ui.aiDraft.defaultProvider = ''; Object.keys(AI_TASKS).forEach(k => ui.aiDraft.tasks[k] = {provider: 'default', model: ''});
      AIS.providers.forEach(p => { ui.aiDraft.providers[p.id] = {baseUrl: p.defaultBaseUrl, model: p.models[0] || '', temperature: '', maxTokens: 4096}; });
      ui.aiTest = {}; renderSettings(); toast('↺ รีเซ็ตแล้ว — กด 💾 บันทึกเพื่อยืนยัน'); return;
    case 'resetUrl': { const p = AIS.providers.find(x => x.id === ui.aiTab); ui.aiDraft.providers[ui.aiTab].baseUrl = p.defaultBaseUrl; renderSettings(); return; }
    case 'setDefault': ui.aiDraft.defaultProvider = ui.aiTab; renderSettings(); return;
    case 'enhance': runEnhance(); return;
    case 'copyEnh': if (lastEnh) copyText(lastEnh.prompt, ' prompt ที่ปรับแล้ว '); return;
    case 'applyEnh': if (!lastEnh) return; state.enhanced = {prompt: lastEnh.prompt, negative: lastEnh.negative, source: lastEnh.source, model: lastEnh.model, by: lastEnh.by}; closeModal(); updatePreview(); toast('✅ ใช้ prompt ที่ AI ปรับแล้ว — Copy / บันทึกเวอร์ชัน จะได้เวอร์ชันนี้'); return;
    case 'unEnhance': state.enhanced = null; updatePreview(); toast('↩︎ กลับไปใช้ prompt ที่ compile จากตัวเลือก'); return;
    case 'translate': translateNow(true); return;
  }
});
function onAIField(e) {
  const t = e.target; if (!t.dataset || !t.dataset.ai || !ui.aiDraft) return;
  const isToggle = t.type === 'checkbox' || t.tagName === 'SELECT';
  if (e.type === 'change' && !isToggle) return; // text fields handled on 'input' (re-render on blur would swallow the next click)
  let v = t.type === 'checkbox' ? t.checked : t.value;
  if (/maxTokens$/.test(t.dataset.ai)) v = v === '' ? '' : +v;
  setPath(ui.aiDraft, t.dataset.ai, v);
  if (/apiKey$/.test(t.dataset.ai)) { const ks = $('#aikeystate'); if (ks) ks.textContent = v ? '✏️ key ใหม่ (จะเข้ารหัสเมื่อบันทึก)' : ''; }
  if (e.type === 'change' && isToggle) renderSettings(); else refreshSettingsLive();
}
document.addEventListener('input', onAIField);
document.addEventListener('change', onAIField);

/* ============================================================
   14) PROJECTS · VERSIONS · PRESETS — persisted through the API (offline mode: localStorage)
   ============================================================ */
let OFFLINE = false;
let USER = null;
const PROJ = {id: null, name: '', saving: false, dirty: false, err: null};
const DRAFT_KEY = 'vpb_current', LAST_KEY = 'vpb_last_project';
let saveTimer = null;
function persist() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch(e) {}
  if (OFFLINE || !PROJ.id) return;
  PROJ.dirty = true; renderSaveStatus();
  clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 800);
}
async function flushSave() {
  clearTimeout(saveTimer);
  if (OFFLINE || !PROJ.id || !PROJ.dirty) return;
  PROJ.dirty = false; PROJ.saving = true; renderSaveStatus();
  try { await api.patch(`/projects/${PROJ.id}`, {spec: state}); PROJ.err = null; }
  catch(e) { PROJ.err = errMsg(e); PROJ.dirty = true; }
  finally { PROJ.saving = false; renderSaveStatus(); }
}
function renderSaveStatus() {
  const el = $('#saveStatus'); if (!el) return;
  const [cls, txt] = OFFLINE ? ['off', '📴 เก็บในเบราว์เซอร์'] : PROJ.err ? ['err', '⚠️ บันทึกไม่สำเร็จ'] : PROJ.saving ? ['busy', '⏳ กำลังบันทึก…'] : PROJ.dirty ? ['busy', '✏️ แก้ไขแล้ว'] : ['ok', '✅ บันทึกแล้ว'];
  el.className = 'savestat ' + cls; el.textContent = txt; el.title = PROJ.err || (OFFLINE ? 'โหมดออฟไลน์: ข้อมูลอยู่ใน localStorage ของเบราว์เซอร์นี้' : 'บันทึกอัตโนมัติลงฐานข้อมูล');
}
function renderProjectBtn() { const b = $('#btnProjects'); if (b) b.innerHTML = `📁 <b>${esc(OFFLINE ? 'ออฟไลน์' : (PROJ.name || 'โปรเจกต์'))}</b> ▾`; }
function renderUser() {
  const el = $('#userMenu'); if (!el) return;
  el.innerHTML = USER ? `${USER.role === 'admin' ? '<button class="btn sm" id="btnAdmin" title="จัดการผู้ใช้ (admin)">👥 ผู้ใช้</button>' : ''}<button class="btn sm uname" id="btnAccount" title="บัญชีของฉัน — ${esc(USER.email)}">👤 ${esc(USER.displayName || USER.email)}${USER.role === 'admin' ? ' <i>admin</i>' : ''}</button><button class="btn sm" id="btnLogout" title="ออกจากระบบ (เครื่องนี้)">⎋ ออก</button>`
    : `<button class="btn sm" id="btnLogout">🔑 เข้าสู่ระบบ</button>`;
}
async function openProject(p) {
  await flushSave();
  PROJ.id = p.id; PROJ.name = p.name; PROJ.err = null; PROJ.dirty = false;
  setState(Object.assign(blank(), p.spec || {}));
  ui.lastParse = null; ui.step = 0;
  try { localStorage.setItem(LAST_KEY, p.id); } catch(e) {}
  renderProjectBtn(); renderAll(); renderSaveStatus();
}
async function initProjects() {
  const {projects} = await api.get('/projects');
  const last = localStorage.getItem(LAST_KEY);
  let p = projects.find(x => x.id === last) || projects[0];
  if (!p) {
    let draft = null; try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch(e) {}
    p = (await api.post('/projects', {name: 'โปรเจกต์แรกของฉัน', spec: draft && draft.sel ? draft : blank()})).project;
  } else p = (await api.get(`/projects/${p.id}`)).project;
  await openProject(p);
}
async function loadPresets() { try { const r = await api.get('/presets'); if (r.presets.length) PRESETS = r.presets; } catch(e) {} }
const fmtDate = s => new Date(s).toLocaleString('th-TH', {dateStyle: 'medium', timeStyle: 'short'});
async function showProjects() {
  if (OFFLINE) { toast('📴 โหมดออฟไลน์ — ข้อมูลเก็บในเบราว์เซอร์ (ใช้ Export/Import JSON)'); return; }
  await flushSave();
  let projects; try { ({projects} = await api.get('/projects')); } catch(e) { toast('❌ ' + errMsg(e)); return; }
  ui.projects = projects;
  openModal(`<h2>📁 โปรเจกต์ของฉัน<span class="sp"></span><button class="btn sm pri" data-pact="new">➕ โปรเจกต์ใหม่</button>&nbsp;<button class="btn sm" data-act="close">✕</button></h2>
   <div class="sub">บันทึกอัตโนมัติลงฐานข้อมูล PostgreSQL · กด "💾 บันทึกเวอร์ชัน" เพื่อเก็บ snapshot ที่ย้อนกลับได้</div>
   <div class="plist2">${projects.map((p, i) => `<div class="prow ${p.id === PROJ.id ? 'cur' : ''}"><div class="pi"><b>${esc(p.name)}</b>${p.id === PROJ.id ? ' <span class="badge">กำลังเปิด</span>' : ''}<span>${(MOD[p.model] || {}).name || p.model} · ${p.versions || 0} เวอร์ชัน · แก้ไขล่าสุด ${fmtDate(p.updatedAt)}</span></div>
     <button class="btn sm" data-prename="${i}">✏️</button><button class="btn sm" data-pdel="${i}">🗑️</button><button class="btn sm pri" data-popen="${i}" ${p.id === PROJ.id ? 'disabled' : ''}>เปิด</button></div>`).join('') || '<div class="empty">ยังไม่มีโปรเจกต์</div>'}</div>
   <div class="mfoot"><button class="btn" data-pact="savePreset">⭐ บันทึกตัวเลือกปัจจุบันเป็น Preset ส่วนตัว</button><span class="sp"></span><button class="btn" data-pact="activity">🧾 กิจกรรมล่าสุด</button></div>`);
}
async function saveVersion() {
  if (OFFLINE) return saveVersionLocal();
  if (!compileCache.prompt) { toast('เลือกตัวเลือกหรือ Preset ก่อน'); return; }
  await flushSave();
  const e = compileCache.enh ? {prompt: compileCache.enh.prompt, negative: compileCache.enh.negative || '', source: compileCache.enh.source} : null;
  try { const {version} = await api.post(`/projects/${PROJ.id}/versions`, {spec: state, enhanced: e});
    toast(`💾 บันทึกเวอร์ชัน v${version.no} แล้ว${version.enhanced ? ' (AI Enhanced)' : ''} · คะแนน ${version.score}`); }
  catch(err) { toast('❌ บันทึกเวอร์ชันไม่สำเร็จ: ' + errMsg(err)); }
}
async function showHistory() {
  if (OFFLINE) return showHistoryLocal();
  let versions; try { ({versions} = await api.get(`/projects/${PROJ.id}/versions`)); } catch(e) { toast('❌ ' + errMsg(e)); return; }
  ui.versions = versions;
  openModal(`<h2>🕘 ประวัติเวอร์ชัน — ${esc(PROJ.name)}<span class="sp"></span><button class="btn sm" data-act="close">✕</button></h2>
   <div class="sub">เก็บในตาราง prompt_versions (server compile ใหม่ทุกครั้งจาก spec จึงเชื่อถือได้) · เรียกคืนแล้วจะเขียนทับตัวเลือกปัจจุบันของโปรเจกต์</div>
   ${versions.length ? versions.map((v, i) => `<div class="hist"><div class="hi"><b>v${v.no} · ${esc(v.title || '')}${v.enhanced ? ' <span class="badge">✨ AI</span>' : ''}</b><span>${fmtDate(v.createdAt)} · ${(MOD[v.model] || {}).name || v.model} · คะแนน ${v.score ?? '-'} · ${v.prompt.length} ตัวอักษร</span></div><button class="btn sm" data-vcopy="${i}">📋</button><button class="btn sm pri" data-vrestore="${i}">↩︎ เรียกคืน</button></div>`).join('') : '<div class="empty vempty">ยังไม่มีเวอร์ชัน — กด 💾 บันทึกเวอร์ชัน</div>'}`);
}
async function showActivity() {
  let history; try { ({history} = await api.get('/history?limit=40')); } catch(e) { toast('❌ ' + errMsg(e)); return; }
  const L = {'project.create':'📁 สร้างโปรเจกต์','project.delete':'🗑️ ลบโปรเจกต์','version.save':'💾 บันทึกเวอร์ชัน','ai.enhance':'✨ AI Enhance','ai.translate':'🌐 แปล','ai.parse':'⚡ Parse ไอเดีย','ai.test':'🔌 ทดสอบ AI','ai.llm':'🤖 LLM','ai.settings':'⚙️ ตั้งค่า AI','auth.login':'🔑 เข้าสู่ระบบ','auth.register':'👤 สมัครสมาชิก','auth.logout_all':'⎋ ออกจากระบบทุกอุปกรณ์','auth.password_change':'🔒 เปลี่ยนรหัสผ่าน'};
  openModal(`<h2>🧾 กิจกรรมล่าสุด<span class="sp"></span><button class="btn sm" data-act="close">✕</button></h2>
   <div class="sub">จากตาราง history (รวมการใช้ AI — provider, model, เวลา, สำเร็จ/ล้มเหลว)</div>
   <div class="plist2">${history.map(h => `<div class="prow"><div class="pi"><b>${L[h.kind] || esc(h.kind)}${h.project_name ? ' · ' + esc(h.project_name) : ''}</b><span>${fmtDate(h.created_at)}${h.detail.provider ? ` · ${esc(h.detail.provider)} / ${esc(h.detail.model)} · ${h.detail.ok ? `✅ ${h.detail.ms}ms` : `❌ ${esc(h.detail.code || '')}`}` : ''}${h.detail.no ? ` · v${h.detail.no}` : ''}</span></div></div>`).join('') || '<div class="empty">ยังไม่มีกิจกรรม</div>'}</div>`);
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-pact],[data-popen],[data-prename],[data-pdel],[data-vcopy],[data-vrestore],#btnProjects,#btnLogout'); if (!t) return;
  const d = t.dataset;
  if (t.id === 'btnProjects') return showProjects();
  if (t.id === 'btnLogout') { await flushSave(); try { await api.post('/auth/logout', {}); } catch(err) {} location.reload(); return; }
  if (d.popen !== undefined) { const p = ui.projects[+d.popen]; try { await openProject((await api.get(`/projects/${p.id}`)).project); closeModal(); toast(`📂 เปิด "${p.name}" แล้ว`); } catch(err) { toast('❌ ' + errMsg(err)); } return; }
  if (d.prename !== undefined) { const p = ui.projects[+d.prename]; const name = prompt('ชื่อโปรเจกต์ใหม่', p.name); if (!name || !name.trim()) return;
    try { await api.patch(`/projects/${p.id}`, {name: name.trim()}); if (p.id === PROJ.id) { PROJ.name = name.trim(); renderProjectBtn(); } showProjects(); } catch(err) { toast('❌ ' + errMsg(err)); } return; }
  if (d.pdel !== undefined) { const p = ui.projects[+d.pdel]; if (!confirm(`ลบโปรเจกต์ "${p.name}" และทุกเวอร์ชัน? (ย้อนกลับไม่ได้)`)) return;
    try { await api.del(`/projects/${p.id}`); if (p.id === PROJ.id) { PROJ.id = null; await initProjects(); } showProjects(); toast('🗑️ ลบโปรเจกต์แล้ว'); } catch(err) { toast('❌ ' + errMsg(err)); } return; }
  if (d.vcopy !== undefined) { copyText(ui.versions[+d.vcopy].prompt, ' prompt '); return; }
  if (d.vrestore !== undefined) { const v = ui.versions[+d.vrestore]; setState(Object.assign(blank(), v.spec)); closeModal(); renderAll(); toast(`↩︎ เรียกคืน v${v.no} แล้ว`); return; }
  switch (d.pact) {
    case 'new': { const name = prompt('ชื่อโปรเจกต์ใหม่', 'โปรเจกต์ใหม่'); if (!name || !name.trim()) return;
      try { const {project} = await api.post('/projects', {name: name.trim(), spec: Object.assign(blank(), {model: state.model})}); await openProject(project); closeModal(); toast(`➕ สร้าง "${project.name}" แล้ว`); } catch(err) { toast('❌ ' + errMsg(err)); } return; }
    case 'savePreset': { const name = prompt('ชื่อ Preset', (state.subject || 'Preset ของฉัน').slice(0, 40)); if (!name || !name.trim()) return;
      try { await api.post('/presets', {name: name.trim(), emoji: '⭐', model: state.model, spec: state}); await loadPresets(); renderCenter(); closeModal(); toast('⭐ บันทึก Preset แล้ว'); } catch(err) { toast('❌ ' + errMsg(err)); } return; }
    case 'activity': showActivity(); return;
  }
});
window.addEventListener('beforeunload', () => { if (PROJ.dirty && !OFFLINE && PROJ.id) { try { fetch(api.base + `/projects/${PROJ.id}`, {method: 'PATCH', credentials: 'include', keepalive: true, headers: {'content-type': 'application/json'}, body: JSON.stringify({spec: state})}); } catch(e) {} } });
initAccount(() => ({ user: USER, esc, openModal, closeModal, toast, errMsg, flushSave }));
initAdmin(() => ({ user: USER, esc, openModal, closeModal, toast, errMsg, fmtDate }));
const LOGOUT_MSG = { account_disabled: '⛔ บัญชีนี้ถูกระงับ — ติดต่อผู้ดูแลระบบ', session_revoked: '🔑 Session ถูกยกเลิก (ออกจากระบบทุกอุปกรณ์ / เปลี่ยนรหัสผ่าน / สิทธิ์ถูกเปลี่ยน) — กรุณาเข้าสู่ระบบใหม่' };
window.addEventListener('vpb:unauthorized', e => { if (!OFFLINE) { toast(LOGOUT_MSG[e.detail?.code] || '🔑 Session หมดอายุ — กรุณาเข้าสู่ระบบใหม่'); setTimeout(() => location.reload(), 1500); } });

/** Entry point (called by main.js after authentication, or in offline mode). */
export async function startApp({user = null, offline = false} = {}) {
  USER = user; OFFLINE = offline;
  document.body.classList.add('authed');
  renderUser(); renderProjectBtn(); renderSaveStatus();
  if (OFFLINE) {
    try { const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (saved && saved.sel) setState(Object.assign(blank(), saved)); } catch(e) {}
    renderAll(); renderAIChip(); return;
  }
  await Promise.all([loadPresets(), loadAI()]);
  await initProjects();
  renderAIChip(); updateThFlags();
}
