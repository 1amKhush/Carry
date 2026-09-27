CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, bundle TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY, device_id TEXT NOT NULL, nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL, origin TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS challenges_expiry ON challenges(expires_at);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, device_id TEXT NOT NULL, expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY, inviter TEXT NOT NULL, secret_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL, signature TEXT NOT NULL, joiner TEXT,
  inviter_signature TEXT, joiner_signature TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS invitations_expiry ON invitations(expires_at);
CREATE TABLE IF NOT EXISTS pairs (
  id TEXT PRIMARY KEY, inviter TEXT NOT NULL, joiner TEXT NOT NULL,
  proof TEXT NOT NULL, revoked INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS pairs_inviter ON pairs(inviter,revoked);
CREATE INDEX IF NOT EXISTS pairs_joiner ON pairs(joiner,revoked);
CREATE TABLE IF NOT EXISTS envelopes (
  id TEXT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT NOT NULL,
  pair_id TEXT NOT NULL, expires_at INTEGER NOT NULL, payload TEXT NOT NULL,
  queued_at INTEGER NOT NULL, received_at INTEGER, continued_at INTEGER
) STRICT;
CREATE INDEX IF NOT EXISTS envelopes_inbox ON envelopes(recipient,queued_at);
CREATE INDEX IF NOT EXISTS envelopes_outbox ON envelopes(sender,expires_at);
CREATE INDEX IF NOT EXISTS envelopes_pair ON envelopes(pair_id);
CREATE INDEX IF NOT EXISTS envelopes_expiry ON envelopes(expires_at);
CREATE TABLE IF NOT EXISTS dedupe (
  id TEXT PRIMARY KEY, sender TEXT NOT NULL, digest TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS dedupe_expiry ON dedupe(expires_at);
