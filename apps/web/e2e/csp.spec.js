import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Strict CSP: style-src 'self' without 'unsafe-inline'. The UI must never rely on inline style attributes/elements.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = p => readFileSync(root + p, 'utf8');
const cspOf = { nginx: () => [...read('apps/web/nginx.conf').matchAll(/Content-Security-Policy "([^"]+)"/g)].map(m => m[1]),
  vercel: () => JSON.parse(read('vercel.json')).headers.flatMap(h => h.headers).filter(h => h.key === 'Content-Security-Policy').map(h => h.value) };

test('CSP config: nginx.conf and vercel.json are identical and have no unsafe-inline', () => {
  const all = [...cspOf.nginx(), ...cspOf.vercel()];
  expect(all.length).toBeGreaterThanOrEqual(3);
  for (const v of all) { expect(v).not.toContain('unsafe-inline'); expect(v).not.toContain('unsafe-eval'); expect(v).toContain("style-src 'self'"); }
  expect(new Set(all).size).toBe(1);
});

test('web sources contain no inline style attributes or <style> elements', () => {
  const files = ['apps/web/index.html', ...readdirSync(root + 'apps/web/src').filter(f => f.endsWith('.js')).map(f => 'apps/web/src/' + f)];
  const hits = files.flatMap(f => read(f).split('\n').map((l, i) => [f, i + 1, l]).filter(([, , l]) => /\sstyle\s*=\s*["'`$]|<style[\s>]|setAttribute\(\s*['"]style|\.cssText\s*=/.test(l)));
  expect(hits.map(([f, n]) => `${f}:${n}`)).toEqual([]);
});

test('no CSP violations across the main UI flows', async ({ page }) => {
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber} ${e.sample}`));
  });
  const res = await page.goto('/');
  const csp = res.headers()['content-security-policy'];
  test.skip(!csp, 'this server sends no CSP header (vite dev server) — run against vite preview / nginx / vercel-local');
  expect(csp).not.toContain('unsafe-inline');
  page.on('dialog', d => d.accept());

  const email = `csp-${Date.now()}@example.com`;
  await page.click('[data-auth="register"]');
  await page.fill('#authEmail', email); await page.fill('#authName', 'CSP'); await page.fill('#authPw', 'csp-password-123');
  await page.click('#authSubmit');
  await expect(page.locator('body')).toHaveClass(/authed/);

  // dynamic colours are applied through CSSOM (data-* → style)
  await page.click('[data-preset="p_drama"]');
  await expect(page.locator('#prompt')).toContainText('A cinematic short film scene');
  expect(await page.locator('.step').first().evaluate(el => el.style.getPropertyValue('--c'))).not.toBe('');
  expect(await page.locator('#legend span[data-sc]').first().evaluate(el => el.style.getPropertyValue('--c'))).not.toBe('');
  expect(await page.locator('#scoreLabel b').evaluate(el => el.style.color)).not.toBe('');
  expect(await page.locator('#charBar').evaluate(el => el.style.width)).not.toBe('');

  // every wizard step, then advanced mode (all groups, swatches, shots/dialogue/consistency blocks)
  const steps = await page.locator('[data-step]').count();
  for (let i = 0; i < steps; i++) await page.click(`[data-step="${i}"]`);
  await page.click('[data-mode="advanced"]');
  await expect(page.locator('.adv-step').first()).toBeVisible();
  const sw = page.locator('.sw i[data-bg]').first();
  if (await sw.count()) expect(await sw.evaluate(el => el.style.background)).not.toBe('');
  await page.click('[data-mode="wizard"]');

  // modals: variations, AI settings (every provider tab), versions, projects
  await page.click('#btnVar'); await expect(page.locator('#mbox .var').first()).toBeVisible(); await page.keyboard.press('Escape');
  await page.click('#btnAI'); await expect(page.locator('.setgrid')).toBeVisible();
  for (const tab of await page.locator('[data-aitab]').all()) await tab.click();
  await page.keyboard.press('Escape');
  await page.click('#btnSave'); await expect(page.locator('#toast')).toContainText('บันทึกเวอร์ชัน');
  await page.click('#btnHistory'); await expect(page.locator('.hist').first()).toBeVisible(); await page.keyboard.press('Escape');
  await page.click('#btnProjects'); await expect(page.locator('.prow').first()).toBeVisible(); await page.keyboard.press('Escape');
  await page.click('#btnAccount'); await expect(page.locator('#pwForm')).toBeVisible(); await page.keyboard.press('Escape');

  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
});
