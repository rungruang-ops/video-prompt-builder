/* Admin: user management (list/search, role, disable/enable, quota & project usage). Admin-only; the API enforces it too. */
import './admin.css';
import { api } from './api.js';

const S = { q: '', role: '', status: '', offset: 0, limit: 20, seq: 0, timer: 0, data: null };
const $ = s => document.querySelector(s);

/** ctx: { user, esc, openModal, closeModal, toast, errMsg, fmtDate } — helpers owned by app.js */
export function showAdmin(ctx) {
  Object.assign(S, { q: '', role: '', status: '', offset: 0, data: null });
  ctx.openModal(`<h2>👥 จัดการผู้ใช้<span class="sp"></span><button class="btn sm" data-act="close">✕</button></h2>
   <div class="adm">
    <div class="admstats" id="admStats"></div>
    <div class="admbar">
     <input id="admQ" type="search" placeholder="🔎 ค้นหาอีเมลหรือชื่อ…" autocomplete="off" aria-label="ค้นหาผู้ใช้">
     <select id="admRole" aria-label="กรองตามบทบาท"><option value="">ทุกบทบาท</option><option value="admin">👑 admin</option><option value="user">ผู้ใช้</option></select>
     <select id="admStatus" aria-label="กรองตามสถานะ"><option value="">ทุกสถานะ</option><option value="active">ใช้งานอยู่</option><option value="disabled">ถูกระงับ</option></select>
    </div>
    <div class="plist2 admlist" id="admList"><div class="empty">⏳ กำลังโหลด…</div></div>
    <div class="admpager" id="admPager"></div>
    <p class="admnote">การเปลี่ยนบทบาทหรือระงับบัญชีจะทำให้ผู้ใช้คนนั้นถูกออกจากระบบทุกอุปกรณ์ทันที · ระบบต้องมี admin ที่ใช้งานได้อย่างน้อย 1 คน · ระงับบัญชีตัวเองไม่ได้</p>
   </div>`, 'wide');
  setTimeout(() => $('#admQ')?.focus(), 0);
  load(ctx);
}

async function load(ctx) {
  const seq = ++S.seq;
  const qs = new URLSearchParams({ limit: String(S.limit), offset: String(S.offset) });
  if (S.q) qs.set('q', S.q); if (S.role) qs.set('role', S.role); if (S.status) qs.set('status', S.status);
  try {
    const d = await api.get('/admin/users?' + qs);
    if (seq !== S.seq || !$('#admList')) return;            // a newer search finished first / modal closed
    S.data = d; render(ctx);
  } catch (e) {
    if (seq !== S.seq || !$('#admList')) return;
    $('#admList').innerHTML = `<div class="empty">❌ ${ctx.esc(ctx.errMsg(e))}</div>`;
  }
}

function render(ctx) {
  const { esc, fmtDate } = ctx, d = S.data;
  $('#admStats').innerHTML = `<span class="tag">ทั้งหมด <b>${d.stats.total}</b> คน</span><span class="tag">👑 admin ที่ใช้งานได้ <b>${d.stats.admins}</b></span>`
    + `<span class="tag">⛔ ถูกระงับ <b>${d.stats.disabled}</b></span><span class="tag">🤖 โควตา AI <b>${d.dailyQuota}</b> ครั้ง/วัน/คน</span>`;
  $('#admList').innerHTML = d.users.length ? d.users.map(u => {
    const pct = u.quota.limit ? u.quota.used / u.quota.limit : 0;
    return `<div class="prow admrow${u.disabled ? ' off' : ''}" data-uid="${esc(u.id)}" data-email="${esc(u.email)}">
     <div class="pi">
      <b>${esc(u.displayName || u.email.split('@')[0])}${u.isSelf ? ' <span class="badge">คุณ</span>' : ''}${u.role === 'admin' ? ' <span class="badge adm">👑 admin</span>' : ''}${u.disabled ? ' <span class="badge dis">⛔ ถูกระงับ</span>' : ''}</b>
      <span>${esc(u.email)} · สมัคร ${esc(fmtDate(u.createdAt))} · เข้าใช้ล่าสุด ${u.lastLoginAt ? esc(fmtDate(u.lastLoginAt)) : 'ยังไม่เคย'}</span>
     </div>
     <div class="admuse">
      <span class="tag" title="จำนวนโปรเจกต์ / เวอร์ชันที่บันทึก">📁 <b class="admproj">${u.projects}</b> โปรเจกต์ · ${u.versions} เวอร์ชัน</span>
      <span class="tag admq${pct >= 1 ? ' full' : pct >= 0.8 ? ' high' : ''}" title="ใช้ AI วันนี้ / โควตาต่อวัน">🤖 วันนี้ <b class="admquota">${u.quota.used}/${u.quota.limit}</b><progress max="${u.quota.limit || 1}" value="${Math.min(u.quota.used, u.quota.limit)}"></progress></span>
      <span class="tag" title="จำนวนครั้งที่เรียก AI ใน 7 วันที่ผ่านมา">7 วัน: ${u.aiCalls7d} ครั้ง</span>
     </div>
     <select class="admrole" data-adm-role aria-label="บทบาทของ ${esc(u.email)}"><option value="user"${u.role === 'user' ? ' selected' : ''}>ผู้ใช้</option><option value="admin"${u.role === 'admin' ? ' selected' : ''}>👑 admin</option></select>
     <button class="btn sm admtoggle" type="button" data-adm-toggle${u.isSelf ? ' disabled title="ระงับบัญชีของตัวเองไม่ได้"' : ''}>${u.disabled ? '✅ เปิดใช้งาน' : '⛔ ระงับ'}</button>
    </div>`;
  }).join('') : `<div class="empty">ไม่พบผู้ใช้${S.q ? ` ที่ตรงกับ “${esc(S.q)}”` : ''}</div>`;
  const from = d.total ? d.offset + 1 : 0, to = d.offset + d.users.length;
  $('#admPager').innerHTML = `<span class="tag">แสดง ${from}–${to} จาก ${d.total} คน</span><span class="sp"></span>`
    + `<button class="btn sm" type="button" data-adm-page="-1"${d.offset <= 0 ? ' disabled' : ''}>← ก่อนหน้า</button>`
    + `<button class="btn sm" type="button" data-adm-page="1"${to >= d.total ? ' disabled' : ''}>ถัดไป →</button>`;
}

async function update(ctx, row, body, confirmText) {
  if (confirmText && !confirm(confirmText)) { render(ctx); return; }
  row.querySelectorAll('select,button').forEach(el => { el.disabled = true; });
  try {
    const r = await api.patch('/admin/users/' + row.dataset.uid, body);
    const who = r.user.displayName || r.user.email;
    ctx.toast(body.disabled === true ? `⛔ ระงับบัญชี ${who} แล้ว — ถูกออกจากระบบทุกอุปกรณ์` : body.disabled === false ? `✅ เปิดใช้งานบัญชี ${who} แล้ว`
      : `👑 เปลี่ยนบทบาท ${who} เป็น ${r.user.role === 'admin' ? 'admin' : 'ผู้ใช้'} แล้ว`);
    if (r.user.isSelf && r.user.role !== 'admin') { setTimeout(() => location.reload(), 1200); return; }   // stepped down: admin UI no longer applies
  } catch (e) { ctx.toast('❌ ' + ctx.errMsg(e)); }
  await load(ctx);
}

/** Wire the admin UI once; getCtx() returns the current helper context. */
export function initAdmin(getCtx) {
  document.addEventListener('click', e => {
    const t = e.target.closest('#btnAdmin,[data-adm-toggle],[data-adm-page]'); if (!t) return;
    const ctx = getCtx();
    if (t.id === 'btnAdmin') { if (ctx.user?.role === 'admin') showAdmin(ctx); return; }
    if (t.dataset.admPage) { S.offset = Math.max(0, S.offset + Number(t.dataset.admPage) * S.limit); load(ctx); return; }
    const row = t.closest('.admrow'), u = S.data?.users.find(x => x.id === row?.dataset.uid); if (!u) return;
    if (u.disabled) update(ctx, row, { disabled: false });
    else update(ctx, row, { disabled: true }, `ระงับบัญชี ${u.email}?\nผู้ใช้จะเข้าสู่ระบบไม่ได้ และถูกออกจากระบบทุกอุปกรณ์ทันที`);
  });
  document.addEventListener('change', e => {
    const t = e.target, ctx = getCtx();
    if (t.id === 'admRole' || t.id === 'admStatus') { S[t.id === 'admRole' ? 'role' : 'status'] = t.value; S.offset = 0; load(ctx); return; }
    if (!t.matches('[data-adm-role]')) return;
    const row = t.closest('.admrow'), u = S.data?.users.find(x => x.id === row?.dataset.uid); if (!u || t.value === u.role) return;
    const self = u.isSelf && t.value !== 'admin';
    update(ctx, row, { role: t.value }, t.value === 'admin'
      ? `แต่งตั้ง ${u.email} เป็น admin?\nผู้ใช้จะต้องเข้าสู่ระบบใหม่`
      : self ? 'ลดสิทธิ์ตัวเองเป็นผู้ใช้ทั่วไป?\nคุณจะเข้าหน้าจัดการผู้ใช้ไม่ได้อีก (อุปกรณ์อื่นของคุณจะถูกออกจากระบบ)' : `ลดสิทธิ์ ${u.email} เป็นผู้ใช้ทั่วไป?\nผู้ใช้จะต้องเข้าสู่ระบบใหม่`);
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'admQ') return;
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { S.q = e.target.value.trim(); S.offset = 0; load(getCtx()); }, 250);
  });
}
