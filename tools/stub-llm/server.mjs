import http from 'node:http';
import { respond } from './stub.mjs';
const port = Number(process.env.STUB_PORT || 9999);
let calls = 0;
http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, calls })); }
  let body = '';
  req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
  req.on('end', () => {
    calls++;
    const h = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const r = respond(req.url, h, body);
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} -> ${r.status}`);
    res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(r.json));
  });
}).listen(port, () => console.log(`stub LLM listening on :${port} (OpenAI /v1/chat/completions, Anthropic /v1/messages, Gemini /v1beta/models/*:generateContent)`));
