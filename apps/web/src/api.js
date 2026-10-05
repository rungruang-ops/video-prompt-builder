/* Tiny JSON API client (cookie session, same-origin by default). */
const BASE = (import.meta.env.VITE_API_BASE || '') + '/api/v1';
export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
async function req(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, { method, credentials: 'include', headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) { throw new ApiError(0, 'network', 'เชื่อมต่อ server ไม่ได้'); }
  const text = await res.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON */ }
  if (!res.ok) {
    const er = (data && data.error) || {};
    if (res.status === 401 && !/^\/auth\/(me|login|register)/.test(path)) window.dispatchEvent(new CustomEvent('vpb:unauthorized', { detail: { code: er.code } }));
    throw new ApiError(res.status, er.code || 'http_' + res.status, er.message || res.statusText || 'request failed', er.details);
  }
  return data;
}
export const api = {
  base: BASE,
  get: p => req('GET', p),
  post: (p, b) => req('POST', p, b ?? {}),
  put: (p, b) => req('PUT', p, b ?? {}),
  patch: (p, b) => req('PATCH', p, b ?? {}),
  del: p => req('DELETE', p),
};
