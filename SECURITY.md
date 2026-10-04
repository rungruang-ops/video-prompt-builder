# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately via GitHub: **Security → Advisories → "Report a vulnerability"** on this repository
(private vulnerability reporting). If that is not available, contact the maintainer through their GitHub profile
(@rungruang-ops) and ask for a private channel.

Please include:
- affected version / commit and deployment type (Docker Compose, Vercel, dev mode)
- steps to reproduce or a proof of concept
- impact (what an attacker can read/change) and any suggested fix

You can expect an acknowledgement within **5 business days**. Fixes are released as normal commits on `main`
with a note in the release/commit message once users have had a chance to update.

## Supported versions

Only the latest commit on `main` is supported.

## Scope notes for deployers

- Never commit `.env`; generate secrets with `npm run env:init` (or `openssl rand`). `ENCRYPTION_KEY` protects
  users' stored provider API keys — keep it in a secret manager and back it up.
- Keep `ALLOW_USER_BASE_URL=off` on internet-facing deployments (SSRF surface); `admin` lets only admins set
  provider base URLs, which are still checked against private/loopback/link-local/metadata addresses.
- Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` before exposing a fresh deployment (otherwise the first person to register
  becomes admin), and consider `REGISTRATION_OPEN=false`.
- The bundled stub LLM (`tools/stub-llm`) is for demos/tests only; production refuses to start against it unless
  `ALLOW_STUB_LLM=true`.
