import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

// scrypt (memory-hard, built into Node — no native deps). N=2^15, r=8, p=1 ≈ 32 MiB per hash.
const N = 32768, r = 8, p = 1, LEN = 64;
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, LEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${h.toString('base64')}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, rr, pp, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const h = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length, { N: +n, r: +rr, p: +pp, maxmem: 64 * 1024 * 1024 });
  return h.length === expected.length && timingSafeEqual(h, expected);
}
