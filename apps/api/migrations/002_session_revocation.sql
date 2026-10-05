-- Session revocation: every JWT carries the user's token_version ("tv"); bumping it invalidates all
-- sessions of that user (log out of all devices, password change, admin actions).
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
