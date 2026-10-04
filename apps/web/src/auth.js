/* Login / register screen. */
import { api } from './api.js';
const $ = s => document.querySelector(s);
const msg = e => (e && e.code === 'validation_error' && e.details && e.details[0] && /password/.test(e.details[0].path) ? 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' : (e && e.message) || 'เกิดข้อผิดพลาด');

export function showAuth({ cfg = {}, serverDown = false, onAuthed, onOffline }) {
  document.body.classList.remove('authed');
  let mode = cfg.firstUser ? 'register' : 'login';
  const setMode = m => {
    mode = m;
    document.querySelectorAll('[data-auth]').forEach(b => b.classList.toggle('on', b.dataset.auth === m));
    $('#nameRow').hidden = m !== 'register';
    $('#authSubmit').textContent = m === 'register' ? 'สร้างบัญชี' : 'เข้าสู่ระบบ';
    $('#authPw').autocomplete = m === 'register' ? 'new-password' : 'current-password';
    $('#authErr').textContent = '';
    $('#authNote').innerHTML = m === 'register'
      ? (cfg.firstUser ? '👑 ยังไม่มีผู้ใช้ในระบบ — บัญชีแรกจะเป็น <b>admin</b>' : cfg.registrationOpen === false ? '⛔ ปิดรับสมัครสมาชิก — ติดต่อผู้ดูแลระบบ' : 'รหัสผ่านถูกเก็บแบบ hash (scrypt) · session เป็น cookie แบบ httpOnly')
      : 'ยังไม่มีบัญชี? กด "สมัครสมาชิก" ด้านบน';
  };
  document.querySelectorAll('[data-auth]').forEach(b => { b.onclick = () => setMode(b.dataset.auth); });
  setMode(mode);
  $('#authOffline').hidden = !serverDown;
  $('#authForm').hidden = serverDown;
  $('#authTabs').hidden = serverDown;
  $('#btnOffline').onclick = () => onOffline();
  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    const email = $('#authEmail').value.trim(), password = $('#authPw').value;
    if (!email || !password) { $('#authErr').textContent = 'กรุณากรอกอีเมลและรหัสผ่าน'; return; }
    const btn = $('#authSubmit'); btn.disabled = true; $('#authErr').textContent = '';
    try {
      const body = mode === 'register' ? { email, password, displayName: $('#authName').value.trim() || undefined } : { email, password };
      const r = await api.post(mode === 'register' ? '/auth/register' : '/auth/login', body);
      $('#authPw').value = '';
      await onAuthed(r.user);
    } catch (err) { $('#authErr').textContent = '❌ ' + msg(err); }
    finally { btn.disabled = false; }
  };
  setTimeout(() => $(serverDown ? '#btnOffline' : '#authEmail')?.focus(), 0);
}
