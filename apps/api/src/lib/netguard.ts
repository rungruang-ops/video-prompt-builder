import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';
import { AppError } from './errors.js';

/**
 * SSRF guard for user-supplied LLM base URLs (custom / Ollama / gateway URLs typed into the settings UI).
 * Server-side URLs from env (*_BASE_URL) are trusted and never go through this check.
 * Residual risk: DNS rebinding between this check and the actual connection — keep ALLOW_USER_BASE_URL=false
 * (default) or "admin" on internet-facing deployments.
 */
export type LookupFn = (host: string) => Promise<string[]>;
export const defaultLookup: LookupFn = async host => (await dnsLookup(host, { all: true, verbatim: true })).map(a => a.address);

const v4ToInt = (ip: string) => ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
const V4_BLOCKS: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
function v4Private(ip: string) {
  const n = v4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => ((n ^ v4ToInt(base)) >>> (32 - bits)) === 0);
}
/** true for loopback, private, link-local (incl. cloud metadata 169.254.169.254), CGNAT, multicast, reserved, ULA … */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return v4Private(ip);
  if (!net.isIPv6(ip)) return true;
  const a = ip.toLowerCase();
  const mapped = a.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) || a.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  if (a.startsWith('::ffff:') || a.startsWith('64:ff9b:')) return true;            // hex-form mapped addresses — refuse
  if (a === '::' || a === '::1') return true;
  const first = parseInt(a.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true;  // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true;  // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true;  // ff00::/8 multicast
  if (first === 0x2001 && parseInt(a.split(':')[1] || '0', 16) === 0x0db8) return true; // documentation
  return false;
}

export interface GuardOptions { allowPrivate: boolean; allowlist: string[]; lookup?: LookupFn }
const bad = (msg: string) => new AppError(400, 'unsafe_base_url', `Base URL ไม่อนุญาต: ${msg}`);

export async function assertSafeBaseUrl(raw: string, o: GuardOptions): Promise<void> {
  let u: URL;
  try { u = new URL(raw); } catch { throw bad('รูปแบบ URL ไม่ถูกต้อง'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw bad('ต้องเป็น http(s)');
  if (u.username || u.password) throw bad('ห้ามใส่ username/password ใน URL');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (o.allowlist.some(h => h === host || (h.startsWith('*.') && host.endsWith(h.slice(1))))) return;
  if (o.allowPrivate) return;
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host)) throw bad('ชี้ไปยังเครือข่ายภายใน (ตั้ง LLM_URL_ALLOWLIST ถ้าตั้งใจ)');
  let addrs: string[];
  if (net.isIP(host)) addrs = [host];
  else {
    try { addrs = await (o.lookup || defaultLookup)(host); } catch { throw bad('หา DNS ของโฮสต์ไม่พบ'); }
  }
  if (!addrs.length || addrs.some(isPrivateIp)) throw bad('ชี้ไปยัง IP ภายใน/สงวน (ตั้ง LLM_URL_ALLOWLIST ถ้าตั้งใจ)');
}

/** Remove anything that looks like a credential from upstream error text before it reaches the client or logs. */
export function redactSecrets(text: string, ...known: string[]): string {
  let s = String(text || '');
  for (const k of known) if (k && k.length >= 6) s = s.split(k).join('[redacted]');
  return s
    .replace(/\b(?:sk|xai|gsk|pk|rk|sess)-[A-Za-z0-9_\-*.]{8,}/g, '[redacted]')
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, '[redacted]')
    .replace(/(bearer\s+)[A-Za-z0-9._\-]{12,}/gi, '$1[redacted]');
}
