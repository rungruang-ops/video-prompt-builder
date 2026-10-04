import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-256-GCM envelope for per-user provider API keys. Format: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function parseKey(k: string): Buffer {
  const buf = /^[0-9a-fA-F]{64}$/.test(k) ? Buffer.from(k, 'hex') : Buffer.from(k, 'base64');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
  return buf;
}
export function encryptSecret(plain: string, key: Buffer, aad = ''): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
export function decryptSecret(blob: string, key: Buffer, aad = ''): string {
  const [v, iv, tag, ct] = blob.split('.');
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('bad secret format');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
export const keyHint = (k: string) => (k.length <= 8 ? '••••' : `${k.slice(0, 3)}…${k.slice(-4)}`);
