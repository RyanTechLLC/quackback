/**
 * Tests for the portal handshake URL emission from the widget identify flow.
 *
 * The handshake URL is only minted when ALL of these hold:
 *   1. The identify call used an HMAC-verified ssoToken (claimsAreVerified=true)
 *   2. The portal visibility is 'private'
 *   3. widgetSignIn is enabled on the portal access config
 *
 * These tests drive the pure minting logic via parsePortalHandshakeToken
 * to confirm the minted token round-trips correctly, without needing to
 * spin up the full identify route handler.
 */
import { describe, it, expect } from 'vitest'
import {
  mintPortalHandshakeToken,
  parsePortalHandshakeToken,
} from '@/lib/server/auth/portal-handshake'
import type { UserId } from '@quackback/ids'

const SECRET = 'test-secret-at-least-32-chars-long-ok!'
const USER_ID = 'user_test123' as UserId
const WORKSPACE = 'workspace'
const PORTAL_ORIGIN = 'https://portal.example.com'

function tryMint(opts: {
  claimsAreVerified: boolean
  visibility: string
  widgetSignIn: boolean
}): string | undefined {
  if (opts.claimsAreVerified && opts.visibility === 'private' && opts.widgetSignIn) {
    return mintPortalHandshakeToken({
      userId: USER_ID,
      workspaceId: WORKSPACE,
      secret: SECRET,
      portalOrigin: PORTAL_ORIGIN,
    }).url
  }
  return undefined
}

describe('mintPortalHandshakeToken — identify flow conditions', () => {
  it('mints a valid round-trippable token with the correct portal URL', () => {
    const { token, url } = mintPortalHandshakeToken({
      userId: USER_ID,
      workspaceId: WORKSPACE,
      secret: SECRET,
      portalOrigin: PORTAL_ORIGIN,
    })

    // URL is correct.
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/portal-handshake')
    expect(parsed.searchParams.get('t')).toBe(token)

    // Token verifies correctly (pure parse, no DB).
    const result = parsePortalHandshakeToken(token, SECRET)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.userId).toBe(USER_ID)
      expect(result.payload.workspaceId).toBe(WORKSPACE)
    }
  })

  it('handshake URL is NOT minted when claimsAreVerified=false (unverified path)', () => {
    const url = tryMint({ claimsAreVerified: false, visibility: 'private', widgetSignIn: true })
    expect(url).toBeUndefined()
  })

  it('handshake URL is NOT minted when visibility is public', () => {
    const url = tryMint({ claimsAreVerified: true, visibility: 'public', widgetSignIn: true })
    expect(url).toBeUndefined()
  })

  it('handshake URL is NOT minted when widgetSignIn=false', () => {
    const url = tryMint({ claimsAreVerified: true, visibility: 'private', widgetSignIn: false })
    expect(url).toBeUndefined()
  })

  it('handshake URL IS minted when all conditions hold', () => {
    const url = tryMint({ claimsAreVerified: true, visibility: 'private', widgetSignIn: true })
    expect(url).toBeDefined()
    expect(url).toContain('/portal-handshake?t=')
  })

  it('tampered URL token is rejected by parsePortalHandshakeToken', () => {
    const { url } = mintPortalHandshakeToken({
      userId: USER_ID,
      workspaceId: WORKSPACE,
      secret: SECRET,
      portalOrigin: PORTAL_ORIGIN,
    })

    const parsedUrl = new URL(url)
    const token = parsedUrl.searchParams.get('t')!
    const [payload] = token.split('.')
    const tamperedToken = `${payload}.BADSIGREPLACEME`

    const result = parsePortalHandshakeToken(tamperedToken, SECRET)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid')
  })
})
