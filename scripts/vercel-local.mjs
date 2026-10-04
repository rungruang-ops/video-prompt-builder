#!/usr/bin/env node
// Local emulation of the Vercel deployment (no Vercel account needed):
//   npx vercel build --yes        # or just `npm run build` (falls back to apps/web/dist + api/index.mjs)
//   node scripts/vercel-local.mjs  # http://localhost:3000 — static SPA + /api/* → the Function handler
// Applies vercel.json headers + rewrites (simplified matcher) and passes the *rewritten* URL to the handler,
// exactly the worst case the handler must undo (apps/api/src/vercel.ts → restoreUrl).
import http from 'node:http';
import { existsSync, readFileSync, statSync, mkdirSync, symlinkSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const vj = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const out = path.join(root, '.vercel/output');
const fnDir = path.join(out, 'functions/api/index.func');
let entry = path.join(root, 'api/index.mjs'), staticDir = path.join(root, vj.outputDirectory);
if (existsSync(fnDir)) {
  // recreate the workspace symlink Vercel adds from .vc-config.json filePathMap
  const link = path.join(fnDir, 'node_modules/@vpb/core');
  if (!existsSync(link)) { mkdirSync(path.dirname(link), { recursive: true }); try { lstatSync(link); } catch { symlinkSync('../../packages/core', link); } }
  entry = path.join(fnDir, 'api/index.mjs'); staticDir = path.join(out, 'static');
}
const handler = (await import(pathToFileURL(entry).href)).default;
const toRe = src => new RegExp('^' + src.replace(/\//g, '\\/') + '$');
const headerRules = (vj.headers || []).map(h => ({ re: toRe(h.source), headers: h.headers }));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://local');
  for (const r of headerRules) if (r.re.test(u.pathname)) for (const h of r.headers) res.setHeader(h.key, h.value);
  req.headers['x-forwarded-for'] = req.socket.remoteAddress || '127.0.0.1';   // Vercel sets the real client IP
  req.headers['x-forwarded-proto'] = 'https';
  const m = u.pathname.match(/^\/api\/(.*)$/);
  if (m) {
    const qs = u.searchParams.toString();
    req.url = `/api?__vpb_path=${encodeURIComponent(m[1])}${qs ? '&' + qs : ''}`;
    return handler(req, res);
  }
  let file = path.join(staticDir, decodeURIComponent(u.pathname));
  if (!file.startsWith(staticDir) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(staticDir, 'index.html');
  res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
}).listen(Number(process.env.PORT || 3000), () => console.log(`vercel-local: http://localhost:${process.env.PORT || 3000}  (function: ${path.relative(root, entry)}, static: ${path.relative(root, staticDir)})`));
