/**
 * Unit tests for resolvePortalAccessForRequest().
 *
 * This is the shared server-side portal-access resolver that gates every
 * public-portal data server function. The two properties under test:
 *  - no-settings-safe: a missing/unreadable portal config → granted/public.
 *  - private + unauthorized caller → denied.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mock: request headers (anonymous by default) ---

vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeaders: () => new Headers(),
}))

// --- Mock: createServerFn (capture the wrapper handler, not under test here) ---

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const chain = {
      inputValidator() {
        return chain
      },
      handler(fn: unknown) {
        return fn
      },
    }
    return chain
  },
}))

// --- Mock: auth (dynamic import target) ---

const mockGetSession = vi.fn()

vi.mock('@/lib/server/auth/index', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}))

// --- Mock: db (dynamic import target) ---

const mockPrincipalFindFirst = vi.fn()
const mockInvitationFindFirst = vi.fn()

vi.mock('@/lib/server/db', () => ({
  db: {
    query: {
      principal: { findFirst: (...args: unknown[]) => mockPrincipalFindFirst(...args) },
      invitation: { findFirst: (...args: unknown[]) => mockInvitationFindFirst(...args) },
    },
  },
  principal: { userId: 'userId' },
  invitation: { email: 'email', kind: 'kind', status: 'status' },
  eq: vi.fn(),
  and: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((parts: TemplateStringsArray) => parts.raw[0]),
}))

// --- Mock: settings service (static import target) ---

const mockGetPortalConfig = vi.fn()

vi.mock('@/lib/server/domains/settings/settings.service', () => ({
  getPortalConfig: () => mockGetPortalConfig(),
  updatePortalConfig: vi.fn(),
}))

// --- Mock: audit log (imported by portal-access.ts) ---

vi.mock('@/lib/server/audit/log', () => ({
  actorFromAuth: vi.fn(),
  recordAuditEvent: vi.fn(),
}))

import { resolvePortalAccessForRequest } from '../portal-access'

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no accepted portal invite.
  mockInvitationFindFirst.mockResolvedValue(null)
})

describe('resolvePortalAccessForRequest — no-settings-safe', () => {
  it('returns granted/public when getPortalConfig throws (no settings row)', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetPortalConfig.mockRejectedValue(new Error('SETTINGS_NOT_FOUND'))

    const result = await resolvePortalAccessForRequest()

    expect(result).toEqual({ granted: true, reason: 'public' })
  })

  it('does not throw when the portal config is unreadable', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetPortalConfig.mockRejectedValue(new Error('DATABASE_ERROR'))

    await expect(resolvePortalAccessForRequest()).resolves.toEqual({
      granted: true,
      reason: 'public',
    })
  })
})

describe('resolvePortalAccessForRequest — public portal', () => {
  it('grants an anonymous caller on a public portal', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetPortalConfig.mockResolvedValue({ access: { visibility: 'public', allowedDomains: [] } })

    const result = await resolvePortalAccessForRequest()

    expect(result.granted).toBe(true)
  })

  it('treats an absent access block as a public portal', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetPortalConfig.mockResolvedValue({})

    const result = await resolvePortalAccessForRequest()

    expect(result).toEqual({ granted: true, reason: 'public' })
  })
})

describe('resolvePortalAccessForRequest — private portal', () => {
  it('denies an anonymous caller on a private portal', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetPortalConfig.mockResolvedValue({ access: { visibility: 'private', allowedDomains: [] } })

    const result = await resolvePortalAccessForRequest()

    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.reason).toBe('unauthenticated')
    }
  })

  it('denies an authenticated non-team caller whose domain is not allowed', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user_1', email: 'outsider@evil.com', emailVerified: true },
    })
    mockPrincipalFindFirst.mockResolvedValue({ type: 'user', role: 'user' })
    mockGetPortalConfig.mockResolvedValue({
      access: { visibility: 'private', allowedDomains: ['acme.com'] },
    })

    const result = await resolvePortalAccessForRequest()

    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.reason).toBe('unauthorized')
    }
  })

  it('grants a team member (admin) on a private portal', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user_admin', email: 'admin@acme.com', emailVerified: true },
    })
    mockPrincipalFindFirst.mockResolvedValue({ type: 'user', role: 'admin' })
    mockGetPortalConfig.mockResolvedValue({
      access: { visibility: 'private', allowedDomains: [] },
    })

    const result = await resolvePortalAccessForRequest()

    expect(result).toEqual({ granted: true, reason: 'team' })
  })

  it('grants a verified caller whose email domain is on the allowlist', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user_2', email: 'person@acme.com', emailVerified: true },
    })
    mockPrincipalFindFirst.mockResolvedValue({ type: 'user', role: 'user' })
    mockGetPortalConfig.mockResolvedValue({
      access: { visibility: 'private', allowedDomains: ['acme.com'] },
    })

    const result = await resolvePortalAccessForRequest()

    expect(result).toEqual({ granted: true, reason: 'domain' })
  })

  it('denies an anonymous-principal session on a private portal', async () => {
    // An anonymous Better Auth session must not count as authenticated.
    mockGetSession.mockResolvedValue({
      user: { id: 'user_anon', email: 'anon@anon.quackback.io', emailVerified: false },
    })
    mockPrincipalFindFirst.mockResolvedValue({ type: 'anonymous', role: 'user' })
    mockGetPortalConfig.mockResolvedValue({
      access: { visibility: 'private', allowedDomains: [] },
    })

    const result = await resolvePortalAccessForRequest()

    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.reason).toBe('unauthenticated')
    }
  })

  it('fails CLOSED when the principal DB lookup throws (deny, not throw)', async () => {
    // A DB error during principal resolution must never grant access and must
    // not throw out of the function — the never-throw contract must hold.
    mockGetSession.mockResolvedValue({
      user: { id: 'user_1', email: 'user@acme.com', emailVerified: true },
    })
    mockPrincipalFindFirst.mockRejectedValue(new Error('DB_CONN_TIMEOUT'))
    mockGetPortalConfig.mockResolvedValue({
      access: { visibility: 'private', allowedDomains: [] },
    })

    const result = await resolvePortalAccessForRequest()

    // Must not throw, and must deny — fail CLOSED.
    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.reason).toBe('unauthenticated')
    }
  })

  it('fails CLOSED on a public portal when the principal lookup throws (treats session as anonymous)', async () => {
    // Even on a public portal, a DB error during principal lookup should fail
    // closed for team-member detection — but a public portal still grants.
    // The function must not throw.
    mockGetSession.mockResolvedValue({
      user: { id: 'user_1', email: 'user@acme.com', emailVerified: true },
    })
    mockPrincipalFindFirst.mockRejectedValue(new Error('DB_CONN_TIMEOUT'))
    mockGetPortalConfig.mockResolvedValue({
      access: { visibility: 'public', allowedDomains: [] },
    })

    await expect(resolvePortalAccessForRequest()).resolves.toMatchObject({ granted: true })
  })
})

describe('resolvePortalAccessForRequest — portal invite grant', () => {
  it('grants reason=invite for a verified caller with an accepted portal invite', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user_inv', email: 'invitee@example.com', emailVerified: true },
    })
    mockPrincipalFindFirst.mockResolvedValue({ type: 'user', role: 'user' })
    mockInvitationFindFirst.mockResolvedValue({ id: 'invite_1' })
    mockGetPortalConfig.mockResolvedValue({
      access: { visibility: 'private', allowedDomains: [] },
    })

    const result = await resolvePortalAccessForRequest()

    expect(result).toEqual({ granted: true, reason: 'invite' })
  })

  it('denies when no accepted invite exists (invite lookup returns null)', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user_inv', email: 'uninvited@example.com', emailVerified: true },
    })
    mockPrincipalFindFirst.mockResolvedValue({ type: 'user', role: 'user' })
    mockInvitationFindFirst.mockResolvedValue(null)
    mockGetPortalConfig.mockResolvedValue({
      access: { visibility: 'private', allowedDomains: [] },
    })

    const result = await resolvePortalAccessForRequest()

    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.reason).toBe('unauthorized')
    }
  })

  it('fails CLOSED on invite lookup DB error (deny, not throw)', async () => {
    // A DB error during the invite lookup must never grant access.
    mockGetSession.mockResolvedValue({
      user: { id: 'user_inv', email: 'invitee@example.com', emailVerified: true },
    })
    mockPrincipalFindFirst.mockResolvedValue({ type: 'user', role: 'user' })
    mockInvitationFindFirst.mockRejectedValue(new Error('DB_TIMEOUT'))
    mockGetPortalConfig.mockResolvedValue({
      access: { visibility: 'private', allowedDomains: [] },
    })

    const result = await resolvePortalAccessForRequest()

    expect(result.granted).toBe(false)
    if (!result.granted) {
      expect(result.reason).toBe('unauthorized')
    }
  })

  it('skips invite lookup when emailVerified=false (unverified email cannot claim invite)', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user_inv', email: 'invitee@example.com', emailVerified: false },
    })
    mockPrincipalFindFirst.mockResolvedValue({ type: 'user', role: 'user' })
    mockGetPortalConfig.mockResolvedValue({
      access: { visibility: 'private', allowedDomains: [] },
    })

    await resolvePortalAccessForRequest()

    // invite lookup should not have been called
    expect(mockInvitationFindFirst).not.toHaveBeenCalled()
  })

  it('skips invite lookup when caller is unauthenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    mockGetPortalConfig.mockResolvedValue({
      access: { visibility: 'private', allowedDomains: [] },
    })

    await resolvePortalAccessForRequest()

    expect(mockInvitationFindFirst).not.toHaveBeenCalled()
  })
})
