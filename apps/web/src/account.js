/* Account modal: change password (revokes other sessions) and "log out of all devices". */
import './account.css';
import { api } from './api.js';

/** ctx: { user, esc, openModal, closeModal, toast, errMsg, flushSave } — helpers owned by app.js */
export function showAccount(ctx) {
  const { user: U, esc } = ctx;
  ctx.openModal(`<h2>👤 บัญชีของฉัน<span class="sp"></span><button class="btn sm" data-act="close">✕</button></h2>
   <div class="acct">
    <div class="who"><b>${esc(U.displayName || U.email)}</b><span class="badge">${U.role === 'admin' ? '👑 admin' : 'ผู้ใช้'}</span><span class="tag">${esc(U.email)}</span></div>
    <div class="sbox">
     <h4>🔒 เปลี่ยนรหัสผ่าน</h4>
     <form id="pwForm" novalidate>
      <label class="fl" for="pwCur">รหัสผ่านปัจจุบัน</label><input id="pwCur" type="password" autocomplete="current-password" required>
      <label class="fl" for="pwNew">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label><input id="pwNew" type="password" autocomplete="new-password" minlength="8" required>
      <label class="fl" for="pwNew2">ยืนยันรหัสผ่านใหม่</label><input id="pwNew2" type="password" autocomplete="new-password" minlength="8" required>
      <div class="autherr" id="pwErr" role="alert"></div>
      <div class="mfoot"><p>เปลี่ยนแล้วอุปกรณ์อื่นทั้งหมดจะถูกออกจากระบบ (อุปกรณ์นี้ยังใช้งานต่อได้)</p><span class="sp"></span><button class="btn pri" id="pwSubmit" type="submit">บันทึกรหัสผ่านใหม่</button></div>
     </form>
    </div>
    <div class="sbox">
     <h4>📱 อุปกรณ์ที่เข้าสู่ระบบ</h4>
     <p>ถ้าลืมออกจากระบบบนเครื่องอื่น หรือสงสัยว่ามีคนอื่นใช้บัญชีนี้ — กดปุ่มด้านล่างเพื่อยกเลิก session ทุกเครื่อง (รวมเครื่องนี้)</p>
     <div class="mfoot"><span class="sp"></span><button class="btn" id="btnLogoutAll" type="button">⎋ ออกจากระบบทุกอุปกรณ์</button></div>
    </div>
   </div>`);
  setTimeout(() => document.querySelector('#pwCur')?.focus(), 0);
}

async function changePassword(ctx) {
  const $ = s => document.querySelector(s);
  const cur = $('#pwCur').value, nw = $('#pwNew').value, nw2 = $('#pwNew2').value, err = $('#pwErr');
  err.textContent = '';
  if (!cur || !nw) { err.textContent = 'กรุณากรอกรหัสผ่านให้ครบ'; return; }
  if (nw.length < 8) { err.textContent = 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร'; return; }
  if (nw !== nw2) { err.textContent = 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'; return; }
  const btn = $('#pwSubmit'); btn.disabled = true;
  try {
    await api.post('/auth/password', { currentPassword: cur, newPassword: nw });
    ctx.closeModal(); ctx.toast('🔒 เปลี่ยนรหัสผ่านแล้ว — อุปกรณ์อื่นถูกออกจากระบบ');
  } catch (e) { err.textContent = '❌ ' + ctx.errMsg(e); }
  finally { btn.disabled = false; }
}

async function logoutAll(ctx) {
  if (!confirm('ออกจากระบบทุกอุปกรณ์ (รวมเครื่องนี้)?')) return;
  await ctx.flushSave();
  try { await api.post('/auth/logout-all', {}); } catch (e) { ctx.toast('❌ ' + ctx.errMsg(e)); return; }
  location.reload();
}

/** Wire the account UI once; getCtx() returns the current helper context (user may change after login). */
export function initAccount(getCtx) {
  document.addEventListener('click', e => {
    const t = e.target.closest('#btnAccount,#btnLogoutAll'); if (!t) return;
    if (t.id === 'btnAccount') showAccount(getCtx()); else logoutAll(getCtx());
  });
  document.addEventListener('submit', e => { if (e.target.id === 'pwForm') { e.preventDefault(); changePassword(getCtx()); } });
}
