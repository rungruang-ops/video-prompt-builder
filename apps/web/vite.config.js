import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// `vite preview` (used by CI e2e) serves the same security headers as production (vercel.json; nginx.conf has the same CSP),
// so the strict CSP is enforced in tests. The dev server stays header-free (HMR injects inline styles).
const prodHeaders = () => {
  const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  return Object.fromEntries(vercel.headers.find(h => h.source === '/(.*)').headers
    .filter(h => h.key !== 'Strict-Transport-Security').map(h => [h.key, h.value]));
};

const api = process.env.VITE_API_PROXY || 'http://localhost:8080';
export default defineConfig(({ isPreview }) => ({
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: api, changeOrigin: false } } },
  preview: { port: 5173, strictPort: true, headers: isPreview ? prodHeaders() : {}, proxy: { '/api': { target: api, changeOrigin: false } } },
  build: { target: 'es2022', sourcemap: true, outDir: 'dist' },
}));
