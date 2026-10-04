// Dev mode without Docker: runs the API (tsx watch), the Vite dev server and (optionally) the stub LLM.
// Requires PostgreSQL (and optionally Redis) reachable via .env — see README.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fillSecrets } from './env-init.mjs';

if (!existsSync('.env')) { writeFileSync('.env', fillSecrets(readFileSync('.env.example', 'utf8')), { mode: 0o600 }); console.log('[dev] created .env from .env.example with random secrets'); }
const withStub = process.argv.includes('--stub') || process.env.STUB_LLM === '1';
// --stub: point the "custom" provider at the local stub (process env wins over .env for the api child)
const env = { ...process.env, ...(withStub ? { CUSTOM_LLM_BASE_URL: process.env.CUSTOM_LLM_BASE_URL || 'http://localhost:9999/v1', CUSTOM_LLM_MODEL: process.env.CUSTOM_LLM_MODEL || 'stub-model' } : {}) };
const procs = [
  ['api', 'npm', ['run', 'dev', '-w', 'apps/api'], '\x1b[36m'],
  ['web', 'npm', ['run', 'dev', '-w', 'apps/web'], '\x1b[35m'],
  ...(withStub ? [['stub', 'node', ['tools/stub-llm/server.mjs'], '\x1b[33m']] : []),
];
const children = procs.map(([name, cmd, args, color]) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
  const out = d => String(d).split('\n').filter(Boolean).forEach(l => console.log(`${color}[${name}]\x1b[0m ${l}`));
  p.stdout.on('data', out); p.stderr.on('data', out);
  p.on('exit', code => { console.log(`[${name}] exited with ${code}`); shutdown(code ?? 1); });
  return p;
});
let done = false;
function shutdown(code = 0) { if (done) return; done = true; children.forEach(c => c.kill('SIGTERM')); setTimeout(() => process.exit(code), 300); }
process.on('SIGINT', () => shutdown(0)); process.on('SIGTERM', () => shutdown(0));
console.log(`[dev] web → http://localhost:5173  ·  api → http://localhost:8080/api/v1/health${withStub ? '  ·  stub LLM → http://localhost:9999' : ''}`);
