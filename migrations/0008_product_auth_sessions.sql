PRAGMA foreign_keys = ON;

-- Product sessions contain only a hash of the browser token.  The raw token is
-- issued once in an HttpOnly cookie and is never written to D1 or logs.
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('google', 'chatgpt')),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK (expires_at > issued_at),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX auth_sessions_active_lookup_idx ON auth_sessions(token_hash, expires_at, revoked_at);

-- OAuth state is one-use and short-lived.  PKCE verifier and nonce values are
-- represented by hashes here; the verifier itself is bound to a short-lived
-- HttpOnly cookie for the callback and is never persisted.
CREATE TABLE oauth_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'chatgpt')),
  state_hash TEXT NOT NULL UNIQUE CHECK (length(state_hash) = 64 AND state_hash NOT GLOB '*[^0-9a-f]*'),
  nonce_hash TEXT NOT NULL CHECK (length(nonce_hash) = 64 AND nonce_hash NOT GLOB '*[^0-9a-f]*'),
  verifier_hash TEXT NOT NULL CHECK (length(verifier_hash) = 64 AND verifier_hash NOT GLOB '*[^0-9a-f]*'),
  redirect_uri TEXT NOT NULL,
  return_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX oauth_transactions_active_lookup_idx ON oauth_transactions(state_hash, expires_at, consumed_at);

CREATE TRIGGER auth_session_identity_immutable
BEFORE UPDATE OF id, application_id, issued_at ON auth_sessions
WHEN NEW.id <> OLD.id OR NEW.application_id <> OLD.application_id OR NEW.issued_at <> OLD.issued_at
BEGIN SELECT RAISE(ABORT, 'auth session identity is immutable'); END;

CREATE TRIGGER oauth_transaction_identity_immutable
BEFORE UPDATE OF id, provider, state_hash, created_at ON oauth_transactions
WHEN NEW.id <> OLD.id OR NEW.provider <> OLD.provider OR NEW.state_hash <> OLD.state_hash OR NEW.created_at <> OLD.created_at
BEGIN SELECT RAISE(ABORT, 'oauth transaction identity is immutable'); END;
