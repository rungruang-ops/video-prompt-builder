import { test, expect } from '@playwright/test';

// Session revocation from the UI: change password (other devices are logged out) and "log out of all devices".
test('change password and log out of all devices revoke other sessions', async ({ browser }) => {
  const email = `acct-${Date.now()}@example.com`, pw1 = 'acct-password-111', pw2 = 'acct-password-222';
  const laptop = await browser.newContext(), phone = await browser.newContext();
  const A = await laptop.newPage(), B = await phone.newPage();
  const errors = [];
  for (const p of [A, B]) p.on('pageerror', e => errors.push(e.message));

  expect((await A.request.post('/api/v1/auth/register', { data: { email, password: pw1, displayName: 'Acct' } })).status()).toBe(201);
  expect((await B.request.post('/api/v1/auth/login', { data: { email, password: pw1 } })).status()).toBe(200);
  await A.goto('/'); await B.goto('/');
  await expect(A.locator('body')).toHaveClass(/authed/); await expect(B.locator('body')).toHaveClass(/authed/);

  // laptop: change password from the account modal
  await A.click('#btnAccount');
  await expect(A.locator('#pwForm')).toBeVisible();
  await A.fill('#pwCur', 'wrong-password'); await A.fill('#pwNew', pw2); await A.fill('#pwNew2', pw2);
  await A.click('#pwSubmit');
  await expect(A.locator('#pwErr')).toContainText('ไม่ถูกต้อง');
  await A.fill('#pwCur', pw1); await A.click('#pwSubmit');
  await expect(A.locator('#toast')).toContainText('เปลี่ยนรหัสผ่านแล้ว');

  // phone: its session is gone; laptop keeps working
  await B.reload(); await expect(B.locator('#authForm')).toBeVisible();
  await A.reload(); await expect(A.locator('body')).toHaveClass(/authed/);

  // phone logs in with the new password, then the laptop logs out everywhere
  await B.fill('#authEmail', email); await B.fill('#authPw', pw2); await B.click('#authSubmit');
  await expect(B.locator('body')).toHaveClass(/authed/);
  A.on('dialog', d => d.accept());
  await A.click('#btnAccount'); await A.click('#btnLogoutAll');
  await expect(A.locator('#authForm')).toBeVisible();
  await B.reload(); await expect(B.locator('#authForm')).toBeVisible();
  expect(errors).toEqual([]);
  await laptop.close(); await phone.close();
});
