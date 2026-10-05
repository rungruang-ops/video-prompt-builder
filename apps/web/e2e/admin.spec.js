import { test, expect } from '@playwright/test';

// Admin user management. Needs a seeded admin: ADMIN_EMAIL / ADMIN_PASSWORD (same values the API was started with).
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL || process.env.ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD };

test('admin searches users, sees usage, disables/enables an account and changes roles', async ({ browser }) => {
  test.skip(!ADMIN.email || !ADMIN.password, 'set ADMIN_EMAIL / ADMIN_PASSWORD (seeded admin) to run the admin e2e');
  const email = `adm-target-${Date.now()}@example.com`, pw = 'target-password-1';
  const adminCtx = await browser.newContext(), userCtx = await browser.newContext();
  const A = await adminCtx.newPage(), U = await userCtx.newPage();
  const errors = [];
  for (const p of [A, U]) p.on('pageerror', e => errors.push(e.message));
  A.on('dialog', d => d.accept());
  await A.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.sample)); });

  // target user: registered, with one project, signed in on its own browser
  expect((await U.request.post('/api/v1/auth/register', { data: { email, password: pw, displayName: 'เป้าหมาย ทดสอบ' } })).status()).toBe(201);
  expect((await U.request.post('/api/v1/projects', { data: { name: 'งานของเป้าหมาย' } })).status()).toBe(201);
  expect((await A.request.post('/api/v1/auth/login', { data: ADMIN })).status()).toBe(200);
  await U.goto('/'); await expect(U.locator('body')).toHaveClass(/authed/);
  await expect(U.locator('#btnAdmin')).toHaveCount(0);                         // normal users get no admin entry
  await A.goto('/'); await expect(A.locator('body')).toHaveClass(/authed/);

  // open the admin modal and search
  await A.click('#btnAdmin');
  await expect(A.locator('#admList .admrow').first()).toBeVisible();
  await expect(A.locator('#admStats')).toContainText('admin ที่ใช้งานได้');
  await A.fill('#admQ', email.toUpperCase());
  const row = A.locator('.admrow', { hasText: email });
  await expect(row).toHaveCount(1);
  await expect(A.locator('#admList .admrow')).toHaveCount(1);
  await expect(row.locator('.admproj')).toHaveText(/^[12]$/);                  // API project (+ the starter project the UI may create)
  await expect(row.locator('.admquota')).toHaveText(/^0\/\d+$/);
  await expect(A.locator('#admPager')).toContainText('จาก 1 คน');

  // own row: cannot disable yourself
  await A.fill('#admQ', ADMIN.email);
  await expect(A.locator('.admrow', { hasText: ADMIN.email }).locator('[data-adm-toggle]')).toBeDisabled();
  await A.fill('#admQ', email);
  await expect(row).toHaveCount(1);

  // disable → the user's open session stops working and login is refused
  await row.locator('[data-adm-toggle]').click();
  await expect(A.locator('#toast')).toContainText('ระงับบัญชี');
  await expect(row.locator('.badge.dis')).toBeVisible();
  await U.reload(); await expect(U.locator('#authForm')).toBeVisible();
  await U.fill('#authEmail', email); await U.fill('#authPw', pw); await U.click('#authSubmit');
  await expect(U.locator('#authErr')).toContainText('ถูกระงับ');

  // filter by status, then enable again → login works
  await A.selectOption('#admStatus', 'disabled');
  await expect(row).toHaveCount(1);
  await row.locator('[data-adm-toggle]').click();
  await expect(A.locator('#toast')).toContainText('เปิดใช้งานบัญชี');
  await expect(row).toHaveCount(0);                                            // no longer matches "disabled"
  await A.selectOption('#admStatus', '');
  await expect(row.locator('.badge.dis')).toHaveCount(0);
  await U.fill('#authPw', pw); await U.click('#authSubmit');
  await expect(U.locator('body')).toHaveClass(/authed/);

  // promote → the user is signed out and sees the admin entry after logging in again; then demote back
  await row.locator('[data-adm-role]').selectOption('admin');
  await expect(row.locator('.badge.adm')).toBeVisible();
  await U.reload(); await expect(U.locator('#authForm')).toBeVisible();
  await U.fill('#authEmail', email); await U.fill('#authPw', pw); await U.click('#authSubmit');
  await expect(U.locator('#btnAdmin')).toBeVisible();
  await row.locator('[data-adm-role]').selectOption('user');
  await expect(row.locator('.badge.adm')).toHaveCount(0);

  expect(errors).toEqual([]);
  expect(await A.evaluate(() => window.__csp)).toEqual([]);                       // admin UI is clean under the strict CSP (vite preview / nginx)
  await adminCtx.close(); await userCtx.close();
});
