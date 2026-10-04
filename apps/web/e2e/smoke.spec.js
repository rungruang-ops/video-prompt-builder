import { test, expect } from '@playwright/test';

const shots = process.env.SCREENSHOT_DIR;
const email = `e2e-${Date.now()}@example.com`;
const password = 'e2e-password-123';

test('register → project → compile → AI (stub) → save version → re-login', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'E2E โปรเจกต์ที่สอง' : undefined));

  await page.goto('/');
  await expect(page.locator('#authForm')).toBeVisible();
  await expect(page.locator('#authOffline')).toBeHidden();
  if (shots) await page.screenshot({ path: `${shots}/screenshot-login.png` });

  // register
  await page.click('[data-auth="register"]');
  await page.fill('#authEmail', email); await page.fill('#authName', 'E2E Sam'); await page.fill('#authPw', password);
  await page.click('#authSubmit');
  await expect(page.locator('body')).toHaveClass(/authed/);
  await expect(page.locator('#saveStatus')).toContainText('บันทึกแล้ว');
  await expect(page.locator('#btnProjects')).toContainText('โปรเจกต์แรกของฉัน');

  // compile from a seeded system preset
  await page.click('[data-preset="p_drama"]');
  await expect(page.locator('#prompt')).toContainText('A cinematic short film scene');
  await expect(page.locator('#saveStatus')).toContainText('บันทึกแล้ว', { timeout: 5000 });

  // AI settings → stub provider (custom, configured by env on the server)
  await page.click('#btnAI'); await expect(page.locator('.setgrid')).toBeVisible();
  await page.selectOption('[data-ai="defaultProvider"]', 'custom');
  await page.click('[data-aitab="custom"]');
  await page.click('[data-aitest="custom"]');
  await expect(page.locator('#aitest-custom .testres.ok')).toContainText('เชื่อมต่อสำเร็จ');
  await page.click('[data-aiact="save"]');
  await expect(page.locator('#aiChip')).toContainText('Custom');

  // Quick-start via AI (parse-idea) — unknown ids are ignored
  await page.fill('#idea', 'แมวส้มนั่งมองฝนตกริมหน้าต่างตอนกลางคืน โทนเย็น เหงาๆ');
  await page.click('[data-act="quick"]');
  await expect(page.locator('.pnote')).toContainText('bogus_light');
  await expect(page.locator('#prompt')).toContainText('orange cat');

  // Enhance → apply
  await page.click('#btnEnhance');
  await expect(page.locator('.enhgrid')).toBeVisible();
  await expect(page.locator('#mbox')).toContainText('volumetric light');
  await page.click('[data-aiact="applyEnh"]');
  await expect(page.locator('#enhBanner')).toContainText('AI ปรับแล้ว');

  // Auto-translate Thai free text (server cache)
  await page.click('[data-mode="advanced"]');
  await page.fill('textarea[data-field="scene_detail"]', 'ตลาดน้ำยามเช้า มีเรือขายผลไม้หลากสี');
  await expect(page.locator('#prompt')).toContainText('floating market', { timeout: 10000 });
  await page.click('[data-mode="wizard"]');

  // Save a version (server re-compiles) and see it in history
  await page.click('#btnSave');
  await expect(page.locator('#toast')).toContainText('บันทึกเวอร์ชัน v1');
  await page.click('#btnHistory');
  await expect(page.locator('.hist').first()).toContainText('v1');
  await page.keyboard.press('Escape');
  if (shots) {
    await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 8000 });
    await page.evaluate(() => { for (const id of ['center', 'out']) { const el = document.getElementById(id); if (el) el.scrollTop = 0; } window.scrollTo(0, 0); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}/screenshot-app.png` });
  }

  // Projects: create a second one, then switch back
  await page.click('#btnProjects'); await page.click('[data-pact="new"]');
  await expect(page.locator('#btnProjects')).toContainText('E2E โปรเจกต์ที่สอง');
  await page.click('#btnProjects');
  await page.locator('.prow', { hasText: 'โปรเจกต์แรกของฉัน' }).locator('[data-popen]').click();
  await expect(page.locator('#btnProjects')).toContainText('โปรเจกต์แรกของฉัน');
  await expect(page.locator('#prompt')).toContainText('floating market');

  // Logout → login → data persisted in PostgreSQL
  await page.click('#btnLogout');
  await expect(page.locator('#authForm')).toBeVisible();
  await page.fill('#authEmail', email); await page.fill('#authPw', 'wrong-password');
  await page.click('#authSubmit'); await expect(page.locator('#authErr')).toContainText('ไม่ถูกต้อง');
  await page.fill('#authPw', password); await page.click('#authSubmit');
  await expect(page.locator('body')).toHaveClass(/authed/);
  await expect(page.locator('#prompt')).toContainText('floating market');
  await expect(page.locator('#aiChip')).toContainText('Custom');

  // only the expected 401 from the wrong-password attempt may appear in the console
  expect(errors.filter(e => !/401 \(Unauthorized\)/.test(e))).toEqual([]);
});

test('API health endpoint is reachable through the web origin', async ({ request }) => {
  const r = await request.get('/api/v1/health');
  expect(r.ok()).toBeTruthy();
  expect(await r.json()).toMatchObject({ status: 'ok', db: true });
});

test('user-controlled strings are rendered inert (no HTML/script injection)', async ({ page }) => {
  const request = page.request;   // shares the browser context's cookie jar
  const xss = '<img src=x onerror="window.__xss=1">"\'><svg onload="window.__xss=2">';
  const mail = `xss-${Date.now()}@example.com`;
  const reg = await request.post('/api/v1/auth/register', { data: { email: mail, password: 'xss-password-123', displayName: xss } });
  expect(reg.status()).toBe(201);
  const pr = await request.post('/api/v1/projects', { data: { name: xss, spec: { subject: xss, scene_detail: xss } } });
  expect(pr.status()).toBe(201);
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  await page.goto('/');
  await expect(page.locator('body')).toHaveClass(/authed/);
  await page.click('#btnProjects');
  await expect(page.locator('#mbox')).toContainText('<img src=x');
  const open = page.locator('.prow', { hasText: '<img src=x' }).locator('[data-popen]');
  if (await open.isEnabled()) await open.click(); else await page.keyboard.press('Escape');   // already the current project
  await expect(page.locator('#btnProjects')).toContainText('<img src=x');
  await expect(page.locator('#prompt')).toContainText('<img src=x');
  await page.click('#btnHistory'); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('img[src="x"], svg[onload]').count()).toBe(0);
  expect(dialogs).toEqual([]);
});
