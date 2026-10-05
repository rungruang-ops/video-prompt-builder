-- Admin user management: accounts can be disabled (cannot log in; sessions are revoked via token_version).
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_created_idx ON users (created_at);
CREATE INDEX IF NOT EXISTS prompt_versions_user_idx ON prompt_versions (user_id);
