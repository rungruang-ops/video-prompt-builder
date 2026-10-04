import { defineConfig } from 'vite';

const api = process.env.VITE_API_PROXY || 'http://localhost:8080';
export default defineConfig({
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: api, changeOrigin: false } } },
  preview: { port: 5173, strictPort: true, proxy: { '/api': { target: api, changeOrigin: false } } },
  build: { target: 'es2022', sourcemap: true, outDir: 'dist' },
});
