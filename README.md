# 🎬 Video Prompt Builder — Full-stack App

เว็บแอปช่วยเขียน prompt สำหรับ AI Video (Veo 3 · Sora 2 · Kling · Runway · Pika · Luma · Hailuo · Tags/SD) แบบคลิกเลือก
พร้อม **backend LLM proxy** (OpenAI · Gemini · Anthropic · xAI · OpenRouter · Ollama · Custom OpenAI-compatible),
**PostgreSQL** (ผู้ใช้ / โปรเจกต์ / เวอร์ชัน / preset / ประวัติ / cache คำแปล / การตั้งค่า provider),
**Redis** (rate limit + quota ต่อผู้ใช้) และระบบล็อกอิน — รันได้ด้วยคำสั่งเดียว `docker compose up`

> ต่อยอดจากต้นแบบ `video-prompt-builder/index.html` (ไฟล์เดียว) — UI เดิมถูกพอร์ตมาแบบคงหน้าตา/พฤติกรรมเดิม
> แต่ข้อมูลทั้งหมดไปเก็บที่ server แทน localStorage และทุกการเรียก AI วิ่งผ่าน backend (ไม่มี API key อยู่ในเบราว์เซอร์อีก)

---

## 1. สถาปัตยกรรม

```
 Browser ──► web (nginx :8080) ──/api──► api (Fastify/Node 24) ──► PostgreSQL 16
   │  SPA (Vite build)                         │  ├─► Redis 7 (rate limit / quota)
   │  same-origin cookie (httpOnly JWT)        │  └─► LLM providers (OpenAI, Gemini, Anthropic, xAI,
   │                                           │       OpenRouter, Ollama, custom) — timeout/retry/error mapping
   └── @vpb/core (shared compiler/taxonomy) ◄──┘  ใช้ร่วมกันทั้ง frontend และ backend
```

| ส่วน | เลือกใช้ | เหตุผล |
|---|---|---|
| Monorepo | **npm workspaces** | ไม่ต้องติดตั้งเครื่องมือเพิ่ม (มากับ Node) — `npm ci` ครั้งเดียวได้ทุกแพ็กเกจ |
| Shared core | `packages/core` (ESM JS ล้วน ไม่มี DOM) | taxonomy 300+ ตัวเลือก, ตัว compile prompt, กฎตรวจขัดแย้ง, คะแนน — **โค้ดเดียวกัน**รันทั้งในเบราว์เซอร์ (พรีวิวทันที/ออฟไลน์) และบน server (compile ซ้ำตอนบันทึกเวอร์ชัน/Enhance เพื่อไม่ต้องเชื่อข้อมูลจาก client) |
| Backend | **Fastify 5 + TypeScript** | ภาษาเดียวกับ core (import ตรง ๆ ไม่ต้องพอร์ต), เร็ว, มี `inject()` สำหรับ API test โดยไม่ต้องเปิดพอร์ต, logging (pino) ในตัว, ปลั๊กอินมาตรฐาน (helmet/cors/cookie/jwt/rate-limit) ครบ — เบากว่า NestJS และไม่ต้องแยกภาษาเหมือน FastAPI |
| Frontend | **Vite 6 + vanilla JS modules** | ต้นแบบเป็น vanilla JS ที่ทดสอบแล้ว ~2,000 บรรทัด — แยกเป็นโมดูลแล้ว import `@vpb/core` แทนการเขียนใหม่ด้วย React ทำให้ UI **ตรงกับต้นแบบ 100%** และความเสี่ยงต่ำกว่า (ถ้าอยากย้ายไป React ภายหลัง core ใช้ต่อได้ทันที) |
| DB | PostgreSQL 16 + migration SQL แบบ forward-only (`apps/api/migrations`) | ใช้ `pg` ตรง ๆ + advisory lock ตอน migrate (กันหลาย instance รันพร้อมกัน) |
| Cache/limit | Redis 7 (fallback เป็น in-memory ถ้าไม่ตั้ง `REDIS_URL`) | rate limit ต่อผู้ใช้/IP, quota LLM รายวัน |
| Serving | nginx (web) reverse-proxy `/api` → api | same-origin → ไม่ต้องเปิด CORS, cookie `SameSite=Lax` ใช้ได้, มี CSP `script-src 'self'` |
| Hosting | Docker Compose **หรือ** Vercel (static + Function, Neon + Upstash) | ดู §3 และ §10 — โค้ดชุดเดียวกัน |

## 2. โครงสร้างโฟลเดอร์

```
video-prompt-builder-app/
├── package.json               # npm workspaces + scripts รวม (dev, build, test, e2e)
├── docker-compose.yml         # postgres, redis, api, web (+ stub-llm ใน profile "stub")
├── .env.example               # ตัวแปรทั้งหมด (คัดลอกเป็น .env)
├── vercel.json                # Vercel: static SPA + Function /api/*, rewrites, security headers, maxDuration, region (sin1)
├── api/index.mjs              # Vercel Function entry → apps/api/src/vercel.ts
├── SECURITY.md                # วิธีแจ้งช่องโหว่
├── .github/workflows/ci.yml   # CI: typecheck, unit+API tests (Postgres+Redis), audit, Playwright e2e, Vercel adapter smoke, docker build
├── packages/core/             # @vpb/core — taxonomy, models, presets, compiler, rules, score (shared)
├── apps/api/                  # Fastify + TS backend
│   ├── src/config.ts          #   ตรวจ env ด้วย zod (production ห้ามใช้ secret ตัวอย่าง)
│   ├── src/app.ts             #   plugins: helmet, cors, cookie, jwt, rate-limit, error handler, health
│   ├── src/routes/            #   auth.ts, projects.ts, meta.ts (taxonomy/presets/compile/history), ai.ts
│   ├── src/llm/               #   providers.ts, adapters.ts (wire formats), client.ts (timeout/retry/error map),
│   │                          #   prompts.ts (system prompts อยู่ฝั่ง server), service.ts (routing/quota/cache)
│   ├── src/lib/               #   crypto (AES-256-GCM), password (scrypt), kv (Redis/Upstash REST/in-memory),
│   │                          #   netguard (SSRF guard + secret redaction), validate
│   ├── src/vercel.ts          #   serverless handler (Vercel)
│   ├── src/db/                #   pool, migrate, seed (system presets + admin)
│   ├── migrations/001_init.sql
│   ├── test/                  #   vitest: unit/ + api/ (LLM providers ถูก mock)
│   └── Dockerfile
├── apps/web/                  # Vite frontend (UI จากต้นแบบ)
│   ├── index.html, src/       #   main.js (bootstrap), auth.js, api.js, app.js (UI), styles.css
│   ├── e2e/smoke.spec.js      #   Playwright smoke
│   ├── nginx.conf, Dockerfile
├── tools/stub-llm/            # LLM ปลอม (พูด protocol OpenAI/Anthropic/Gemini) สำหรับ dev/test/demo
├── scripts/dev.mjs            # dev mode ไม่ใช้ Docker (api + web + stub)
├── scripts/env-init.mjs       # สร้าง .env พร้อม secret สุ่ม (npm run env:init)
├── scripts/smoke.mjs          # API smoke test กับ stack ที่รันอยู่
├── scripts/vercel-build.mjs   # build command ของ Vercel (+ migrate แบบเลือกได้)
├── scripts/vercel-local.mjs   # จำลอง Vercel บนเครื่อง (ไม่ต้องมีบัญชี)
└── screenshots/
```

## 3. เริ่มใช้งานด้วย Docker (แนะนำ)

ต้องมี Docker Engine 24+ และ Docker Compose v2

```bash
npm run env:init          # = node scripts/env-init.mjs → สร้าง .env + JWT_SECRET / ENCRYPTION_KEY / POSTGRES_PASSWORD แบบสุ่ม
# (ไม่มี Node บนเครื่อง? cp .env.example .env แล้วแทนทุก CHANGE-ME ด้วย:
#    openssl rand -base64 48 → JWT_SECRET · openssl rand -base64 32 → ENCRYPTION_KEY · openssl rand -hex 24 → POSTGRES_PASSWORD)
# ENCRYPTION_KEY ห้ามเปลี่ยนภายหลัง ไม่งั้น API key ที่ผู้ใช้บันทึกไว้จะถอดรหัสไม่ได้
# ใส่ API key ของ provider ที่ต้องการ เช่น OPENAI_API_KEY=...

docker compose up -d --build      # api รันแบบ NODE_ENV=production (ปฏิเสธ secret ที่เป็น placeholder)
# เปิด http://localhost:8080  (เปลี่ยนพอร์ตด้วย WEB_PORT ใน .env)
# ผู้ใช้คนแรกที่สมัคร = admin  (หรือกำหนด ADMIN_EMAIL / ADMIN_PASSWORD ให้ seed ตอนเริ่ม)
```

ลองโดยไม่มี API key จริง (ใช้ stub LLM):

```bash
# ใน .env (สำหรับเดโมเท่านั้น):
#   CUSTOM_LLM_BASE_URL=http://stub-llm:9999/v1
#   CUSTOM_LLM_MODEL=stub-model
#   ALLOW_STUB_LLM=true          # production จะไม่ยอมสตาร์ทกับ stub ถ้าไม่ตั้งค่านี้
docker compose --profile stub up -d --build
node scripts/smoke.mjs http://localhost:8080          # API smoke: register → login → project → compile → AI → version
```

คำสั่งที่ใช้บ่อย:

```bash
docker compose ps                       # สถานะ + healthcheck
docker compose logs -f api              # log (JSON/pino)
docker compose down                     # หยุด (ข้อมูลยังอยู่ใน volume pgdata/redisdata)
docker compose down -v                  # หยุด + ลบข้อมูลทั้งหมด ⚠️
docker compose exec postgres pg_dump -U vpb vpb > backup.sql   # สำรองข้อมูล
```

> ใช้ Ollama บนเครื่อง host: container เรียก `http://host.docker.internal:11434/v1` ให้อัตโนมัติ (ตั้ง `OLLAMA_BASE_URL_DOCKER` เพื่อเปลี่ยน)
> และต้องให้ Ollama ฟังบน 0.0.0.0 (`OLLAMA_HOST=0.0.0.0 ollama serve`)

## 4. Dev mode (ไม่ใช้ Docker)

ต้องมี Node.js 24 (ใช้ 22.12+ ได้), PostgreSQL 14+ และ (ไม่บังคับ) Redis

```bash
npm install
# สร้างฐานข้อมูล (ตัวอย่าง)
sudo -u postgres psql -c "CREATE ROLE vpb LOGIN PASSWORD 'vpb';" -c "CREATE DATABASE vpb OWNER vpb;" -c "CREATE DATABASE vpb_test OWNER vpb;"
npm run env:init                # .env พร้อม secret สุ่ม (DATABASE_URL / REDIS_URL ชี้ localhost; REDIS_URL ว่าง = in-memory)
npm run dev -- --stub           # api :8080 + web :5173 (hot reload) + stub LLM :9999
#   (--stub ตั้ง provider "Custom" ให้ชี้ไปที่ stub อัตโนมัติ — เลือก Custom ในหน้า ⚙️ ตั้งค่า AI)
npm run dev                     # แบบไม่มี stub (ใช้ provider จริงตาม .env)
# เปิด http://localhost:5173  (Vite proxy /api → :8080)
```

แยกรันทีละตัว: `npm run dev:api`, `npm run dev:web`, `npm run stub-llm`, migrate อย่างเดียว: `npm run migrate`

> ถ้า backend ล่ม หน้า login จะมีปุ่ม **"ใช้แบบออฟไลน์"** — ใช้ builder ได้ (compile ในเบราว์เซอร์ด้วย `@vpb/core`, เก็บใน localStorage, AI ใช้ตัวจับคำแบบออฟไลน์)

## 5. ตัวแปรแวดล้อม (.env)

| ตัวแปร | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `NODE_ENV` | `development` (docker compose: `production` — เปลี่ยนด้วย `API_NODE_ENV`; Vercel: `production`) | `production` = ปฏิเสธการสตาร์ทถ้า `JWT_SECRET`/`ENCRYPTION_KEY`/รหัสผ่าน DB ยังเป็น placeholder หรือชี้ไปที่ stub LLM |
| `LOG_LEVEL` | `info` | `fatal`…`trace` (log เป็น JSON, ปิดบัง header `authorization`/`cookie`) |
| `WEB_PORT` | `8080` | พอร์ตบน host ของ web (docker compose) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `vpb` / — / `vpb` | ใช้โดย compose (api สร้าง `DATABASE_URL` เอง) — **ต้องตั้งรหัสผ่าน** |
| `DATABASE_URL` | `postgres://vpb:vpb@localhost:5432/vpb` | ใช้ตอนรันแบบ native (compose override ให้) |
| `DATABASE_SSL` | `false` | `true` = TLS + ตรวจใบรับรอง (Neon, RDS, Supabase) · `no-verify` = TLS แต่ไม่ตรวจใบรับรอง (เฉพาะ self-signed — เสี่ยง MITM) |
| `DB_POOL_MAX` / `DB_CONNECT_RETRIES` | `10` / `30` (Vercel: `3` / `2`) | ขนาด connection pool / จำนวนครั้งรอ DB ตอนสตาร์ท |
| `MIGRATE_ON_START` | `true` (Vercel: `false`) | รัน migration + seed system presets ตอนสตาร์ท (ปิดแล้วใช้ `npm run migrate`) |
| `MIGRATE_ON_BUILD` | ว่าง | Vercel: `true` = รัน migration ระหว่าง build ของ production deployment (preview ไม่ migrate) |
| `REDIS_URL` | `redis://localhost:6379` | Redis/Upstash ผ่าน TCP (`rediss://…upstash.io:6379`) · ว่าง = ใช้ REST ด้านล่าง หรือ in-memory (instance เดียว) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (หรือ `KV_REST_API_URL` / `KV_REST_API_TOKEN` จาก Vercel) | ว่าง | Upstash ผ่าน HTTPS REST — ใช้เมื่อ `REDIS_URL` ว่าง |
| `JWT_SECRET` | `CHANGE-ME` | ≥ 32 ตัวอักษร — `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | `7d` | อายุ session |
| `ENCRYPTION_KEY` | `CHANGE-ME` | 32 bytes base64/hex — `openssl rand -base64 32` — เข้ารหัส API key ของผู้ใช้ (AES-256-GCM) **ห้ามเปลี่ยน/ทำหาย** |
| `COOKIE_SECURE` | `false` | `true` เมื่อเสิร์ฟผ่าน HTTPS |
| `COOKIE_NAME` | `vpb_session` | ชื่อ cookie (httpOnly, SameSite=Lax) |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:8080` | origin ที่อนุญาต (คั่นด้วย `,`) — ใช้เฉพาะเมื่อ frontend อยู่คนละ origin |
| `TRUST_PROXY` | `1` | จำนวน proxy ที่เชื่อถือหน้า API (1 = nginx ใน docker หรือ edge ของ Vercel; 2 ถ้ามี reverse proxy อีกชั้นหน้า nginx; `false` ถ้าเปิดพอร์ต api ตรง) — ใช้หา IP จริงสำหรับ rate limit โดยปลอม `X-Forwarded-For` ไม่ได้ |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ว่าง | seed admin ตอน migrate/สตาร์ท (รหัส ≥ 12 ตัว) — ถ้าไม่ตั้ง ผู้ใช้คนแรกที่สมัคร = admin (**deploy สาธารณะควรตั้งเสมอ**) |
| `REGISTRATION_OPEN` | `true` | `false` = ปิดการสมัคร (หลังสร้าง admin แล้ว) |
| `API_RATE_PER_MIN` | `300` | request/นาที ต่อผู้ใช้ (หรือ IP ถ้ายังไม่ล็อกอิน) |
| `AUTH_RATE_PER_MIN` | `10` | ล็อกอิน/สมัคร ต่อ IP ต่อนาที (กัน brute force) |
| `LLM_RATE_PER_MIN` | `20` | เรียก AI ต่อผู้ใช้ต่อนาที |
| `LLM_DAILY_QUOTA` | `200` | เรียก AI ต่อผู้ใช้ต่อวัน (UTC) — cache hit ของคำแปลไม่นับ |
| `LLM_TIMEOUT_MS` / `LLM_MAX_RETRIES` / `LLM_TOTAL_TIMEOUT_MS` | `60000` / `2` / `110000` (Vercel: `50000` / `1` / `100000`) | timeout ต่อครั้ง / retry (network, 429, 5xx, เคารพ `Retry-After`) / งบเวลารวมต่อคำขอ — ต้องน้อยกว่า `maxDuration` ของ Vercel (120s) |
| `ALLOW_USER_KEYS` | `true` | ให้ผู้ใช้ใส่ API key ของตัวเอง (เก็บแบบเข้ารหัสใน DB) |
| `ALLOW_USER_BASE_URL` | `off` | ใครกำหนด base URL เองได้: `off` (ใช้แค่ URL ใน env) · `admin` · `all` — URL ของผู้ใช้ผ่าน SSRF guard (ปฏิเสธ IP ภายใน/loopback/link-local/metadata, ไม่ follow redirect) และ **ไม่ได้รับ API key ของ server** |
| `LLM_URL_ALLOWLIST` | ว่าง | hostname ที่อนุญาตแม้ชี้ IP ภายใน เช่น `ollama.lan,*.corp.example` |
| `LLM_ALLOW_PRIVATE_URLS` | `false` | ปิดการตรวจ IP ภายในทั้งหมด (เฉพาะระบบภายในที่ไว้ใจผู้ใช้) |
| `ALLOW_STUB_LLM` | `false` | อนุญาตให้ production ชี้ไปที่ stub LLM (เดโมเท่านั้น) |
| `DEFAULT_LLM_PROVIDER` | ว่าง | provider เริ่มต้นของผู้ใช้ใหม่ (`openai`, `gemini`, `anthropic`, `xai`, `openrouter`, `ollama`, `custom`) |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY` / `OPENROUTER_API_KEY` | ว่าง | key ระดับ server (ผู้ใช้ทุกคนใช้ร่วมกัน ถ้าไม่ได้ใส่ key ของตัวเอง) |
| `*_MODEL` / `*_BASE_URL` | ค่ามาตรฐานของ provider | override รุ่นโมเดล/endpoint (เช่น Azure/gateway) |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | `http://localhost:11434/v1` | Ollama (ไม่ต้องมี key) |
| `CUSTOM_LLM_BASE_URL` / `CUSTOM_LLM_API_KEY` / `CUSTOM_LLM_MODEL` | ว่าง | endpoint ที่รองรับ OpenAI `/chat/completions` (vLLM, LM Studio, LiteLLM …) |

ลำดับการเลือก API key: key ที่พิมพ์ในหน้า "ทดสอบ" (ยังไม่บันทึก) → key ของผู้ใช้ (DB, เข้ารหัส) → key ใน `.env`
API key **ไม่เคยถูกส่งกลับไปที่เบราว์เซอร์** (แสดงแค่ hint เช่น `sk-…a1b2`)

## 6. การทดสอบ

```bash
npm run typecheck                         # TypeScript (api + tests)
npm test -w packages/core                 # unit tests ของ compiler/taxonomy (node:test)
npm test -w apps/api                      # unit + API tests (vitest) — ต้องมี Postgres: TEST_DATABASE_URL
                                          #   ค่าเริ่มต้น postgres://vpb:vpb@localhost:5432/vpb_test (ฐานนี้จะถูกล้าง!)
TEST_REDIS_URL=redis://localhost:6379/15 npm test -w apps/api   # ทดสอบ rate limit/quota กับ Redis จริง
npm test                                  # core + api
npm run build                             # tsc (api) + vite build (web)

# E2E (Playwright) — ต้องมี stack รันอยู่ + stub LLM
npx -w apps/web playwright install chromium            # ครั้งแรก
npm run dev -- --stub                                  # terminal 1
npm run e2e                                            # terminal 2  (BASE_URL=http://localhost:5173)
BASE_URL=http://localhost:8080 npm run e2e             # กับ docker compose --profile stub
SCREENSHOT_DIR=$PWD/screenshots npm run e2e            # เก็บภาพหน้าจอ login/app (1440x900)
```

API tests ใช้ **fake fetch** แทน provider จริง (เส้นทางเดียวกับ `tools/stub-llm`) ครอบคลุม: รูปแบบ request ของ OpenAI/Anthropic/Gemini/Ollama,
การ parse คำตอบ, JSON-mode fallback, retry/timeout, การแปลง error (401→`provider_auth`, 429→`provider_rate_limited`, 5xx→`provider_error`,
timeout→`provider_timeout`), เข้ารหัส key ใน DB, แยกข้อมูลระหว่างผู้ใช้, cache คำแปล, quota/rate limit, security headers, CORS

CI (`.github/workflows/ci.yml`) รันทั้งหมดนี้บน GitHub Actions พร้อม service containers Postgres/Redis + Playwright + docker build

## 7. API (สรุป) — base `/api/v1`, ตอบ error รูปแบบ `{ "error": { "code", "message", "details" } }`

ข้อมูลไม่ผ่าน validation → `400` `{ "error": { "code": "validation_error", "message": "ข้อมูลไม่ถูกต้อง: <path> <ข้อความ>", "details": [{ "path": ["password"], "code": "too_small", "message": "…" }] } }` — `details[].code` เป็นรหัส issue ของ zod 4 (เช่น `too_small`, `too_big`, `invalid_type`, `invalid_format`, `invalid_value`, `custom`); ข้อความ default เป็นภาษาอังกฤษของ zod (ไม่ควรใช้เทียบค่าในโค้ด ให้ใช้ `code` + `path`)

| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/health`, `/health/live` | readiness (DB + Redis, 503 ถ้าล่ม) / liveness |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | cookie httpOnly JWT |
| GET | `/auth/me`, `/auth/session`, `/auth/config` | ผู้ใช้ปัจจุบัน + quota |
| GET | `/taxonomy`, `/models`, `/presets` | ข้อมูลจาก `@vpb/core` + preset ระบบ/ของผู้ใช้ |
| POST/DELETE | `/presets`, `/presets/:id` | preset ของผู้ใช้ |
| POST | `/prompt/compile` | compile spec → prompt/negative/conflicts/score/params (server-side) |
| GET/POST | `/projects` · GET/PATCH/DELETE `/projects/:id` | `spec` = งานที่กำลังแก้ (frontend autosave) |
| GET/POST | `/projects/:id/versions` · GET `/versions/:id` | บันทึกเวอร์ชัน (server compile ซ้ำ; รับ prompt ที่ Enhance แล้วเฉพาะเมื่อ `source` ตรงกับที่ compile ได้) |
| GET | `/history` | activity log |
| GET/PUT | `/ai/settings` · DELETE `/ai/keys` · GET `/ai/providers` | ตั้งค่า provider/โมเดล/การ route ต่องาน |
| POST | `/ai/test` | ทดสอบการเชื่อมต่อ (รับค่า draft ได้) |
| POST | `/ai/translate` | แปลไทย→อังกฤษ (cache ใน DB ใช้ร่วมกันทุกผู้ใช้) |
| POST | `/ai/parse-idea` | ไอเดีย → structured spec (กรอง id ที่ไม่รู้จักออก) |
| POST | `/ai/enhance` | ขัดเกลา prompt (server compile spec เอง + system prompt ฝั่ง server) |
| POST | `/llm` | generic proxy `{ provider?, model?, messages, json? }` — ผู้ใช้ทั่วไปได้ system prompt กลางเสมอ (admin กำหนดเองได้) |

## 8. ความปลอดภัย

- รหัสผ่าน: scrypt (N=32768) + salt, เปรียบเทียบแบบ timing-safe; login ผิดใช้เวลาเท่ากับผู้ใช้ที่มีอยู่จริง; การสมัครคนแรก (= admin) ล็อกด้วย advisory lock กัน race
- Session: JWT (HS256 เท่านั้น) ใน cookie `httpOnly` + `SameSite=Lax` (+ `Secure` เมื่อ `COOKIE_SECURE=true`) อายุตาม `JWT_EXPIRES_IN`; request ที่แก้ข้อมูลต้องเป็น `application/json` (ช่วยกัน CSRF แบบ form)
- API key ของผู้ใช้: AES-256-GCM พร้อม AAD = `userId:provider` (ย้าย ciphertext ข้ามผู้ใช้ไม่ได้); ข้อความ error จาก provider ถูกลบส่วนที่ดูเหมือน key ก่อนส่งกลับ
- SSRF: base URL ที่ผู้ใช้กำหนด (`ALLOW_USER_BASE_URL=admin|all`) ต้องผ่านการตรวจ DNS/IP (ห้าม loopback, private, link-local/metadata 169.254.169.254, CGNAT, ULA …), ห้ามมี user:pass, ไม่ follow redirect, ไม่ได้รับ key ของ server และผลแปลจาก endpoint ของผู้ใช้ไม่เข้า cache กลาง
- Validation ทุก endpoint ด้วย zod, จำกัดขนาด body, rate limit ต่อผู้ใช้/IP (Redis/Upstash), quota LLM รายวัน; ทุก query เป็น parameterized SQL
- Security headers: helmet (API) + nginx / `vercel.json` (CSP `script-src 'self'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS บน Vercel); UI escape ข้อความของผู้ใช้/LLM ทุกจุด (มี e2e test ตรวจ XSS)
- Production ปฏิเสธการสตาร์ทถ้า secret/รหัสผ่าน DB เป็น placeholder หรือชี้ไปที่ stub LLM; Postgres/Redis ใน compose ไม่เปิดพอร์ตออก host; container api รันเป็น user `node`
- CI: `permissions: contents: read`, actions pin ด้วย commit SHA, `persist-credentials: false`, ไม่ใช้ `pull_request_target`, secret ของ CI สุ่มใหม่ทุก run, `npm audit --audit-level=high`
- ดู [SECURITY.md](SECURITY.md) สำหรับการแจ้งช่องโหว่

## 9. Deployment (Docker, production)

1. เซิร์ฟเวอร์ที่มี Docker + Compose (หรือ Kubernetes — image แยก `apps/api/Dockerfile`, `apps/web/Dockerfile`)
2. `.env`: `npm run env:init` (secret ใหม่ทั้งหมด), API key ของ provider, `COOKIE_SECURE=true`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` (อย่าเปิดพอร์ต api ตรงสู่ internet — ให้ผ่าน web/nginx เท่านั้น)
3. โดเมน + HTTPS: วาง reverse proxy ที่ออกใบรับรองให้ (Caddy / Traefik / nginx + certbot / Cloudflare) ไปที่ `web:8080` แล้วเปิด HSTS ใน `apps/web/nginx.conf` และตั้ง `TRUST_PROXY=2` (proxy 2 ชั้น)
4. ถ้า frontend อยู่คนละโดเมนกับ API ให้ตั้ง `CORS_ORIGINS` (ปกติไม่ต้อง — nginx proxy `/api` ให้แบบ same-origin)
5. หลังสร้าง admin แล้วพิจารณา `REGISTRATION_OPEN=false`
6. สำรองข้อมูล: `pg_dump` ตามรอบ + เก็บ `ENCRYPTION_KEY` ไว้ในที่ปลอดภัย (secret manager) — ถ้า key หาย API key ของผู้ใช้ต้องใส่ใหม่ทั้งหมด
7. Managed DB/Redis: ตั้ง `DATABASE_URL` (+ `DATABASE_SSL=true`) และ `REDIS_URL` แล้วตัด service `postgres`/`redis` ออกจาก compose
8. Scale: api เป็น stateless (session = JWT, limit/quota อยู่ใน Redis) — เพิ่ม replica ได้; migration ใช้ advisory lock

## 10. Deploy to Vercel

สถาปัตยกรรมบน Vercel: frontend = static Vite build (`apps/web/dist`) · backend = Vercel Function เดียว `api/index.mjs`
(ห่อ Fastify app เดิม — `apps/api/src/vercel.ts`) · `vercel.json` rewrite `/api/*` → function และทุก path อื่น → SPA (`index.html`)
พร้อม security headers ชุดเดียวกับ nginx · `maxDuration` = 120 วินาที (AI timeout รวมถูกตั้งไว้ที่ 100 วินาที) ·
PostgreSQL ภายนอก (Neon) + Redis ภายนอก (Upstash) · **migration ไม่รันตอน cold start**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frungruang-ops%2Fvideo-prompt-builder&project-name=video-prompt-builder&repository-name=video-prompt-builder&env=JWT_SECRET,ENCRYPTION_KEY,ADMIN_EMAIL,ADMIN_PASSWORD&envDescription=JWT_SECRET%3A%20openssl%20rand%20-base64%2048%20%C2%B7%20ENCRYPTION_KEY%3A%20openssl%20rand%20-base64%2032&envLink=https%3A%2F%2Fgithub.com%2Frungruang-ops%2Fvideo-prompt-builder%23vercel-env)

> ปุ่ม Deploy ใช้ได้เมื่อ repo เป็น public (หรือผู้กดมีสิทธิ์เข้าถึง repo) — ถ้า repo เป็น private ให้ใช้ขั้นตอน "Import" ด้านล่าง

### ขั้นตอน

1. **Import repo**: Vercel Dashboard → *Add New… → Project* → เลือก GitHub repo `video-prompt-builder`
   - Framework Preset: **Other** (ค่าใน `vercel.json` กำหนด install/build/output ให้แล้ว — ไม่ต้องแก้ Root Directory)
   - Node.js Version: 24.x (อ่านจาก `engines` ใน `package.json`)
2. **สร้าง Postgres (Neon)**: แท็บ *Storage* (Marketplace) → **Neon** → Create (region **Singapore `sin1`** ให้ตรงกับ Function) → Connect กับโปรเจกต์
   (Vercel จะใส่ `DATABASE_URL` แบบ pooled และ `DATABASE_URL_UNPOOLED` ให้) — หรือสร้างที่ neon.tech แล้วคัดลอก connection string เอง
3. **สร้าง Redis (Upstash)**: แท็บ *Storage* → **Upstash for Redis** → Create (primary region **`sin1`**) → Connect
   (จะได้ `REDIS_URL` แบบ `rediss://` และ/หรือ `KV_REST_API_URL` + `KV_REST_API_TOKEN` — แอปรองรับทั้งสองแบบ, ถ้ามี `REDIS_URL` จะใช้ TCP ก่อน)
4. <a id="vercel-env"></a>**ตั้ง Environment Variables** (*Settings → Environment Variables*, เลือก Production + Preview):

   | ตัวแปร | ค่า |
   |---|---|
   | `JWT_SECRET` | `openssl rand -base64 48` |
   | `ENCRYPTION_KEY` | `openssl rand -base64 32` (ห้ามเปลี่ยนภายหลัง) |
   | `DATABASE_URL` | จาก Neon (pooled, host มี `-pooler`) — ใส่ให้อัตโนมัติถ้าใช้ Marketplace |
   | `DATABASE_SSL` | `true` |
   | `REDIS_URL` หรือ `KV_REST_API_URL` + `KV_REST_API_TOKEN` | จาก Upstash (อัตโนมัติถ้าใช้ Marketplace) |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | บัญชี admin (รหัส ≥ 12 ตัว) — **ตั้งเสมอ** เพื่อไม่ให้คนแปลกหน้าสมัครเป็นคนแรกแล้วได้ admin |
   | `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY` / `OPENROUTER_API_KEY` | key ของ provider ที่ต้องการ (อย่างน้อย 1 ตัว หรือให้ผู้ใช้ใส่ key ของตัวเอง) |
   | `DEFAULT_LLM_PROVIDER` | เช่น `openai` (ไม่บังคับ) |
   | `MIGRATE_ON_BUILD` | `true` ถ้าต้องการให้ migrate อัตโนมัติตอน build ของ **production** deployment |
   | `REGISTRATION_OPEN` | `false` ถ้าใช้คนเดียว/ทีมปิด |

   ค่าเริ่มต้นบน Vercel ที่ตั้งให้แล้ว (override ได้): `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY=1`,
   `MIGRATE_ON_START=false`, `DB_POOL_MAX=3`, `LLM_TIMEOUT_MS=50000`, `LLM_MAX_RETRIES=1`, `LLM_TOTAL_TIMEOUT_MS=100000`
   — ไม่ต้องตั้ง `CORS_ORIGINS` (frontend กับ API อยู่ origin เดียวกัน) · Ollama/stub LLM ใช้บน Vercel ไม่ได้ (ไม่มีเครือข่ายภายใน)
5. **Migration** (เลือกหนึ่งทาง):
   - อัตโนมัติ: ตั้ง `MIGRATE_ON_BUILD=true` → `scripts/vercel-build.mjs` จะรัน `npm run migrate:dist -w apps/api` เฉพาะ production deployment
     (ใช้ `DATABASE_URL_UNPOOLED` ถ้ามี เพราะ migration ใช้ advisory lock) — preview deployment จะไม่ migrate
   - เอง (แนะนำครั้งแรก): จากเครื่องตัวเอง
     ```bash
     DATABASE_URL="postgres://USER:PASSWORD@ep-xxx.REGION.aws.neon.tech/neondb" DATABASE_SSL=true \
     ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run migrate
     ```
     (ใช้ connection string แบบ **direct/unpooled** ของ Neon)
6. **Deploy**: กด Deploy (หรือ push ไป `main`) → เปิด `https://<project>.vercel.app/api/v1/health` ต้องได้ `{"status":"ok","db":true,"cache":{"kind":"redis"|"upstash-rest","ok":true}}`
7. **ตรวจหลัง deploy**: `node scripts/smoke.mjs https://<project>.vercel.app <provider>` (ต้องตั้ง provider/key ก่อน) · ใส่ custom domain ได้ใน *Settings → Domains* (HTTPS อัตโนมัติ)

### ทดสอบโครงสร้าง Vercel บนเครื่อง (ไม่ต้องล็อกอิน)

```bash
mkdir -p .vercel && echo '{"projectId":"local","orgId":"local","settings":{"framework":null}}' > .vercel/project.json
npx vercel@latest build --yes            # สร้าง .vercel/output (static + functions/api/index.func) แบบ offline
DATABASE_URL=... JWT_SECRET=... ENCRYPTION_KEY=... COOKIE_SECURE=false npm run vercel:local   # http://localhost:3000
node scripts/smoke.mjs http://localhost:3000
```

### ข้อควรรู้บน Vercel
- **Region**: `vercel.json` ตั้ง `"regions": ["sin1"]` (สิงคโปร์) ให้ Function อยู่ใกล้ Neon/Upstash — ตอนสร้าง Neon/Upstash ให้เลือก region `sin1` ให้ตรงกัน (ถ้า DB อยู่คนละ region ทุก query จะช้าขึ้นหลายร้อย ms) · ถ้าย้าย DB ไป region อื่น ให้แก้ค่านี้ตาม · Hobby รองรับ Function ได้ 1 region (ห้ามใส่หลายค่า)
- Function เป็น serverless: connection pool เล็ก (`DB_POOL_MAX=3`) + ใช้ Neon pooled URL; rate limit/quota ต้องมี Redis/Upstash (ถ้าไม่มีจะนับแยกต่อ instance)
- คำขอ AI ที่ยาวกว่า ~100 วินาทีจะได้ `provider_timeout` (Hobby รองรับ `maxDuration` สูงสุด 300s — ปรับใน `vercel.json` และ `LLM_TOTAL_TIMEOUT_MS` ได้)
- `ALLOW_USER_BASE_URL` ควรเป็น `off` บน Vercel (endpoint ภายในใช้ไม่ได้อยู่แล้ว)

## 11. ข้อจำกัดที่ทราบ

- ยังไม่มี: ยืนยันอีเมล, ลืมรหัสผ่าน/รีเซ็ต, OAuth, หน้า admin จัดการผู้ใช้, การหมุน `ENCRYPTION_KEY` อัตโนมัติ, การเพิกถอน session ก่อนหมดอายุ (logout ลบ cookie แต่ JWT ที่ถูกขโมยยังใช้ได้จนหมดอายุ — ลด `JWT_EXPIRES_IN` ได้)
- SSRF guard ตรวจ DNS ก่อนเชื่อมต่อ — ยังมีความเสี่ยง DNS rebinding แคบ ๆ จึงตั้งค่าเริ่มต้น `ALLOW_USER_BASE_URL=off`
- CSP ยังต้องใช้ `style-src 'unsafe-inline'` (UI ใช้ inline style attributes)
- ชื่อโมเดลเริ่มต้นของแต่ละ provider (`apps/api/src/llm/providers.ts`) อ้างอิงข้อมูล ต.ค. 2026 — ควรตรวจกับเอกสาร provider และ override ด้วย `*_MODEL`
- OpenAI ใช้ Chat Completions (ยังไม่ใช้ Responses API); xAI ใช้ endpoint แบบ OpenAI-compatible
- quota รายวันนับตามวัน UTC; ไม่มีการนับ token/ค่าใช้จ่ายจริง

## License

MIT © 2026 rungruang-ops — ดูไฟล์ [LICENSE](LICENSE)
