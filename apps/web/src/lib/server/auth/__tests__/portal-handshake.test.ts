/**
 * Tests for portal handshake token mint + verify.
 *
 * The DB-round-trip (one-time use enforcement) is tested via a minimal
 * in-memory mock of portalHandshakeUsed so the test suite stays unit-level.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import type { UserId } from '@quackback/ids'

// =============================================================================
// Inline mock for DB — controls findFirst and insert per-test
// =============================================================================

const usedSet = new Set<string>()
let findFirstImpl: (args: unknown) => Promise<unknown>

vi.mock('@/lib/server/db', () => ({
  db: {
    query: {
      portalHandshakeUsed: {
        findFirst: vi.fn(async (args: unknown) => findFirstImpl(args)),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(async (row: { jti: string }) => {
        if (usedSet.has(row.jti)) {
          throw new Error('unique constraint violated')
        }
        usedSet.add(row.jti)
      }),
    })),
  },
  portalHandshakeUsed: {},
}))

// Import the module under test AFTER the mock is in place.
const { mintPortalHandshakeToken, parsePortalHandshakeToken, verifyPortalHandshakeToken } =
  await import('../portal-handshake')

const SECRET = 'test-secret-at-least-32-chars-long-ok'
const WORKSPACE = 'workspace_test'
const USER_ID = 'user_abc123' as UserId

function freshMint() {
  return mintPortalHandshakeToken({
    userId: USER_ID,
    workspaceId: WORKSPACE,
    secret: SECRET,
    portalOrigin: 'https://portal.example.com',
  })
}

beforeEach(() => {
  usedSet.clear()
  findFirstImpl = async () => null // default: jti not yet consumed
})

// =============================================================================
// mintPortalHandshakeToken
// =============================================================================

describe('mintPortalHandshakeToken', () => {
  it('returns a token and an absolute URL on the portal domain', () => {
    const { token, url } = freshMint()
    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(2) // payload.signature
    const parsed = new URL(url)
    expect(parsed.origin).toBe('https://portal.example.com')
    expect(parsed.pathname).toBe('/portal-handshake')
    expect(parsed.searchParams.get('t')).toBe(token)
  })

  it('payload contains userId, workspaceId, exp (10 min out), jti', () => {
    const before = Math.floor(Date.now() / 1000)
    const { token } = freshMint()
    const payloadB64 = token.split('.')[0]
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    expect(payload.userId).toBe(USER_ID)
    expect(payload.workspaceId).toBe(WORKSPACE)
    expect(typeof payload.jti).toBe('string')
    expect(payload.jti.length).toBeGreaterThan(8)
    expect(payload.exp).toBeGreaterThanOrEqual(before + 10 * 60 - 2)
    expect(payload.exp).toBeLessThanOrEqual(before + 10 * 60 + 2)
  })

  it('each mint produces a unique jti', () => {
    const a = freshMint()
    const b = freshMint()
    const jtiA = JSON.parse(Buffer.from(a.token.split('.')[0], 'base64url').toString()).jti
    const jtiB = JSON.parse(Buffer.from(b.token.split('.')[0], 'base64url').toString()).jti
    expect(jtiA).not.toBe(jtiB)
  })
})

// =============================================================================
// parsePortalHandshakeToken (pure — no DB)
// =============================================================================

function buildSignedToken(payload: unknown, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

describe('parsePortalHandshakeToken', () => {
  it('round-trips: parse succeeds for a freshly minted token', () => {
    const { token } = freshMint()
    const result = parsePortalHandshakeToken(token, SECRET)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.userId).toBe(USER_ID)
      expect(result.payload.workspaceId).toBe(WORKSPACE)
    }
  })

  it('returns invalid for a tampered signature', () => {
    const { token } = freshMint()
    const [payload] = token.split('.')
    const tampered = `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`
    const result = parsePortalHandshakeToken(tampered, SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid')
  })

  it('returns invalid for a tampered payload', () => {
    const { token } = freshMint()
    const [, sig] = token.split('.')
    const altPayload = Buffer.from(
      JSON.stringify({ userId: 'user_evil', workspaceId: WORKSPACE, exp: 9999999999, jti: 'x' })
    ).toString('base64url')
    const tampered = `${altPayload}.${sig}`
    const result = parsePortalHandshakeToken(tampered, SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid')
  })

  it('returns invalid when signed with a different secret', () => {
    const { token } = freshMint()
    const result = parsePortalHandshakeToken(token, 'wrong-secret-at-least-32-chars-long!')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid')
  })

  it('returns expired for a token whose exp is in the past', () => {
    const pastPayload = {
      userId: USER_ID,
      workspaceId: WORKSPACE,
      exp: Math.floor(Date.now() / 1000) - 1,
      jti: 'jti_expired',
    }
    const expiredToken = buildSignedToken(pastPayload, SECRET)
    const result = parsePortalHandshakeToken(expiredToken, SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('expired')
  })

  it('returns invalid for a token with missing required fields', () => {
    const badPayload = { userId: USER_ID } // missing workspaceId, exp, jti
    const token = buildSignedToken(badPayload, SECRET)
    const result = parsePortalHandshakeToken(token, SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid')
  })

  it('returns invalid for a malformed token (no dot)', () => {
    const result = parsePortalHandshakeToken('notavalidtoken', SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid')
  })
})

// =============================================================================
// verifyPortalHandshakeToken (with DB one-time-use)
// =============================================================================

describe('verifyPortalHandshakeToken', () => {
  it('succeeds and marks the jti consumed on first use', async () => {
    const { token } = freshMint()
    const result = await verifyPortalHandshakeToken(token, SECRET)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.userId).toBe(USER_ID)
    }
  })

  it('returns used on replay (second redemption of same token)', async () => {
    const { token } = freshMint()
    // First use succeeds.
    await verifyPortalHandshakeToken(token, SECRET)

    // Simulate DB returning the jti as found on the second call.
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())
    findFirstImpl = async () => ({ jti: payload.jti })

    const second = await verifyPortalHandshakeToken(token, SECRET)
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error).toBe('used')
  })

  it('returns invalid for a tampered token', async () => {
    const { token } = freshMint()
    const [payload] = token.split('.')
    const bad = `${payload}.AAAAAAAAAAAAAAAAAAA`
    const result = await verifyPortalHandshakeToken(bad, SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid')
  })

  it('returns expired for an expired token', async () => {
    const pastPayload = {
      userId: USER_ID,
      workspaceId: WORKSPACE,
      exp: Math.floor(Date.now() / 1000) - 60,
      jti: 'jti_expired_verify',
    }
    const expiredToken = buildSignedToken(pastPayload, SECRET)
    const result = await verifyPortalHandshakeToken(expiredToken, SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('expired')
  })

  it('returns used when concurrent replay races insert (unique constraint violation)', async () => {
    const { token } = freshMint()
    // Pre-populate usedSet so the insert will throw a unique violation.
    const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())
    usedSet.add(payload.jti)

    const result = await verifyPortalHandshakeToken(token, SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('used')
  })
})
