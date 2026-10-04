import { defineConfig } from '@playwright/test';
// E2E smoke against a running stack (dev: http://localhost:5173, docker: http://localhost:8080).
// The API must be able to reach an LLM: the bundled stub (CUSTOM_LLM_BASE_URL=http://localhost:9999/v1, CUSTOM_LLM_MODEL=stub-model).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    locale: 'th-TH',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ['--no-sandbox'] } : {},
  },
});
