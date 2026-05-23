/**
 * Portal handshake token — signed, short-lived, one-time-use.
 *
 * When a widget-HMAC-verified user visits a private portal with
 * widgetSignIn enabled, the widget bootstrap includes a handshake URL.
 * Clicking it lands the user on /portal-handshake?t=<token>; this
 * module handles minting and verifying that token.
 *
 * Format: <base64url-payload>.<base64url-hmac>
 *   Payload JSON: { userId, workspaceId, exp, jti }
 *
 * The same HMAC-SHA256 mechanism used by widget identity tokens is
 * reused here — same secret, same algorithm, no new key required.
 */

import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import type { UserId } from '@quackback/ids'

// =============================================================================
// Constants
// =============================================================================

/** Handshake tokens expire after 10 minutes. */
const HANDSHAKE_TTL_SECONDS = 10 * 60

// =============================================================================
// Types
// =============================================================================

export interface HandshakePayload {
  userId: UserId
  workspaceId: string
  /** Unix-second expiry. */
  exp: number
  /** Random token ID for one-time-use enforcement. */
  jti: string
}

export type VerifyHandshakeResult =
  | { ok: true; payload: HandshakePayload }
  | { ok: false; error: 'expired' | 'invalid' | 'used' }

// =============================================================================
// Internal helpers
// =============================================================================

function encodeB64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeB64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

// =============================================================================
// Mint
// =============================================================================

export interface MintHandshakeTokenOptions {
  userId: UserId
  workspaceId: string
  /** Widget secret for signing. */
  secret: string
  /** Origin of the portal, e.g. https://feedback.example.com */
  portalOrigin: string
}

export interface MintHandshakeTokenResult {
  token: string
  url: string
}

/**
 * Mint a portal handshake token and the absolute URL to /portal-handshake
 * on the portal domain. The token is signed with the workspace's widget
 * secret (same HMAC-SHA256 as widget identity tokens).
 */
export function mintPortalHandshakeToken(
  opts: MintHandshakeTokenOptions
): MintHandshakeTokenResult {
  const { userId, workspaceId, secret, portalOrigin } = opts

  const now = Math.floor(Date.now() / 1000)
  const payload: HandshakePayload = {
    userId,
    workspaceId,
    exp: now + HANDSHAKE_TTL_SECONDS,
    jti: randomBytes(16).toString('hex'),
  }

  const payloadB64 = encodeB64Url(JSON.stringify(payload))
  const sig = sign(payloadB64, secret)
  const token = `${payloadB64}.${sig}`

  const url = new URL('/portal-handshake', portalOrigin)
  url.searchParams.set('t', token)

  return { token, url: url.toString() }
}

// =============================================================================
// Verify (pure — no DB access)
// =============================================================================

/**
 * Verify the token's signature and expiry without checking one-time use.
 * Returns the decoded payload on success or an error discriminant.
 * Callers must check one-time use separately (see verifyPortalHandshakeToken).
 */
export function parsePortalHandshakeToken(
  token: string,
  secret: string
): { ok: true; payload: HandshakePayload } | { ok: false; error: 'expired' | 'invalid' } {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return { ok: false, error: 'invalid' }

  const payloadB64 = token.slice(0, dot)
  const receivedSig = token.slice(dot + 1)

  // Verify signature with constant-time comparison.
  const expectedSig = sign(payloadB64, secret)
  const expectedBuf = Buffer.from(expectedSig, 'base64url')
  const receivedBuf = Buffer.from(receivedSig, 'base64url')
  if (
    expectedBuf.length === 0 ||
    receivedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    return { ok: false, error: 'invalid' }
  }

  let payload: unknown
  try {
    payload = JSON.parse(decodeB64Url(payloadB64))
  } catch {
    return { ok: false, error: 'invalid' }
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as Record<string, unknown>).userId !== 'string' ||
    typeof (payload as Record<string, unknown>).workspaceId !== 'string' ||
    typeof (payload as Record<string, unknown>).exp !== 'number' ||
    typeof (payload as Record<string, unknown>).jti !== 'string'
  ) {
    return { ok: false, error: 'invalid' }
  }

  const p = payload as HandshakePayload
  if (Math.floor(Date.now() / 1000) > p.exp) {
    return { ok: false, error: 'expired' }
  }

  return { ok: true, payload: p }
}

// =============================================================================
// Full verify with one-time-use enforcement (requires DB)
// =============================================================================

/**
 * Verify the token, then enforce one-time use via a DB insert on success.
 *
 * On success: inserts the jti into portal_handshake_used and returns the
 * payload. Callers must create a portal session for payload.userId.
 *
 * On failure: returns an error discriminant — 'expired', 'invalid', or
 * 'used' (replayed token). No DB write occurs on failure.
 */
export async function verifyPortalHandshakeToken(
  token: string,
  secret: string
): Promise<VerifyHandshakeResult> {
  const parsed = parsePortalHandshakeToken(token, secret)
  if (!parsed.ok) {
    return { ok: false, error: parsed.error }
  }

  const { payload } = parsed

  // Lazy import to keep this file isomorphic in tests.
  const { db, portalHandshakeUsed } = await import('@/lib/server/db')

  // Check for replay.
  let existing: unknown
  try {
    existing = await db.query.portalHandshakeUsed.findFirst({
      where: (t, { eq }) => eq(t.jti, payload.jti),
      columns: { jti: true },
    })
  } catch {
    // Fail safe — if the DB is unavailable, deny.
    return { ok: false, error: 'invalid' }
  }

  if (existing) {
    return { ok: false, error: 'used' }
  }

  // Mark consumed.
  try {
    await db.insert(portalHandshakeUsed).values({
      jti: payload.jti,
      consumedAt: new Date(),
      expiresAt: new Date(payload.exp * 1000),
    })
  } catch {
    // Concurrent replay race: the insert failed because another request
    // just consumed the same jti. Treat as replayed.
    return { ok: false, error: 'used' }
  }

  return { ok: true, payload }
}
