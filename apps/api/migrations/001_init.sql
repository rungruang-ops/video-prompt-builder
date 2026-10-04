-- 001_init: core schema for Video Prompt Builder
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  display_name  text,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

CREATE TABLE projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  target_model text NOT NULL DEFAULT 'veo',
  spec         jsonb NOT NULL DEFAULT '{}'::jsonb,      -- current working PromptSpec (autosaved)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_user_updated_idx ON projects (user_id, updated_at DESC);

-- Immutable snapshots ("prompt_specs / versions")
CREATE TABLE prompt_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_no        integer NOT NULL,
  title             text,
  target_model      text NOT NULL,
  spec              jsonb NOT NULL,
  compiled_prompt   text NOT NULL,
  compiled_negative text NOT NULL DEFAULT '',
  enhanced          boolean NOT NULL DEFAULT false,
  score             integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version_no)
);
CREATE INDEX prompt_versions_project_idx ON prompt_versions (project_id, version_no DESC);

CREATE TABLE presets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text,
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,  -- NULL = system preset
  is_system    boolean NOT NULL DEFAULT false,
  name_th      text NOT NULL,
  emoji        text NOT NULL DEFAULT '⭐',
  target_model text NOT NULL DEFAULT 'veo',
  spec         jsonb NOT NULL,
  sort_order   integer NOT NULL DEFAULT 100,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (is_system = (user_id IS NULL))
);
CREATE UNIQUE INDEX presets_system_slug_uq ON presets (slug) WHERE is_system;
CREATE INDEX presets_user_idx ON presets (user_id);

-- Audit / activity history (project events + LLM usage)
CREATE TABLE history (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  kind       text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX history_user_created_idx ON history (user_id, created_at DESC);

-- Shared server-side translation cache (TH -> EN), keyed by sha256 of the normalised source
CREATE TABLE translation_cache (
  source_hash  text PRIMARY KEY,
  source_text  text NOT NULL,
  target_lang  text NOT NULL DEFAULT 'en',
  translated   text NOT NULL,
  provider     text,
  model        text,
  hits         integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

-- Per-user AI routing/settings (no secrets) + encrypted per-user provider keys
CREATE TABLE user_ai_settings (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings   jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE provider_credentials (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    text NOT NULL,
  api_key_enc text NOT NULL,          -- AES-256-GCM (ENCRYPTION_KEY), never returned by the API
  key_hint    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
