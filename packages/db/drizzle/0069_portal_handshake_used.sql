-- ============================================================================
-- portal_handshake_used table
-- ============================================================================
--
-- Tracks consumed portal handshake token JTIs to enforce one-time use.
-- Each row records a jti that has been redeemed; a replay attempt is
-- rejected the moment the same jti is found here.
--
-- expires_at stores the original token's expiry so a future cleanup job
-- can prune rows with: DELETE FROM portal_handshake_used WHERE expires_at < now()
--
-- Re-run-safe: guarded by IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "portal_handshake_used" (
  "jti"          text PRIMARY KEY,
  "consumed_at"  timestamptz NOT NULL DEFAULT now(),
  "expires_at"   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "portal_handshake_used_expires_at_idx"
  ON "portal_handshake_used" ("expires_at");
