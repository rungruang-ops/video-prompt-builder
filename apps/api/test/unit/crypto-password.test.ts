import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, parseKey, keyHint } from '../../src/lib/crypto.js';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';
import { loadConfig } from '../../src/config.js';

const key = parseKey(Buffer.alloc(32, 1).toString('base64'));
describe('crypto', () => {
  it('round-trips with AES-256-GCM and binds AAD', () => {
    const blob = encryptSecret('sk-secret-123', key, 'u1:openai');
    expect(blob.startsWith('v1.')).toBe(true); expect(blob).not.toContain('sk-secret');
    expect(decryptSecret(blob, key, 'u1:openai')).toBe('sk-secret-123');
    expect(() => decryptSecret(blob, key, 'u2:openai')).toThrow();
    expect(() => decryptSecret(blob, parseKey('ab'.repeat(32)), 'u1:openai')).toThrow();
  });
  it('random IV per encryption + hints', () => {
    expect(encryptSecret('x', key)).not.toBe(encryptSecret('x', key));
    expect(keyHint('sk-abcdefghijkl')).toBe('sk-…ijkl');
  });
  it('rejects bad key sizes', () => { expect(() => parseKey('c2hvcnQ=')).toThrow(); });
});
describe('password', () => {
  it('hashes with scrypt and verifies', async () => {
    const h = await hashPassword('correct horse');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});
describe('config', () => {
  const base = { JWT_SECRET: 'x'.repeat(40), ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64') };
  it('validates secrets', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...base, ENCRYPTION_KEY: 'nope' })).toThrow(/ENCRYPTION_KEY/);
    expect(loadConfig(base).PORT).toBe(8080);
  });
  it('refuses example secrets in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'dev-only-change-me-0123456789abcdef0123456789abcdef', ENCRYPTION_KEY: base.ENCRYPTION_KEY })).toThrow(/placeholder/);
  });
});
