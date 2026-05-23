/**
 * Unit tests for portal-invite server functions:
 *   sendPortalInviteFn, cancelPortalInviteFn, resendPortalInviteFn,
 *   fetchPortalInvitesFn.
 *
 * All four handlers are captured via the createServerFn mock and exercised
 * directly, following the established pattern in the auth/settings test files.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// createServerFn stub — captures .handler() callbacks in order
// ---------------------------------------------------------------------------

type AnyHandler = (args: { data: Record<string, unknown> }) => Promise<unknown>
type NoArgHandler = () => Promise<unknown>

const handlers: (AnyHandler | NoArgHandler)[] = []

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const chain = {
      inputValidator() {
        return chain
      },
      handler(fn: AnyHandler | NoArgHandler) {
        handlers.push(fn)
        return chain
      },
    }
    return chain
  },
}))

vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeaders: () => new Headers(),
}))

// ---------------------------------------------------------------------------
// Shared hoisted mocks
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockRecordAuditEvent: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbQuery: {
    user: { findFirst: vi.fn() },
    principal: { findFirst: vi.fn() },
    invitation: { findFirst: vi.fn(), findMany: vi.fn() },
  },
  mockSendPortalInviteEmail: vi.fn(),
  mockMintMagicLinkUrl: vi.fn(),
  mockGetEmailSafeUrl: vi.fn(),
  mockGetBaseUrl: vi.fn(),
  mockGenerateId: vi.fn(),
}))

vi.mock('@/lib/server/functions/auth-helpers', () => ({
  requireAuth: hoisted.mockRequireAuth,
}))

vi.mock('@/lib/server/audit/log', () => ({
  recordAuditEvent: hoisted.mockRecordAuditEvent,
  actorFromAuth: (auth: { user: { id: string; email: string }; principal: { role: string } }) => ({
    userId: auth.user.id,
    email: auth.user.email,
    role: auth.principal.role,
  }),
}))

vi.mock('@/lib/server/db', () => {
  const insertChain = { values: hoisted.mockDbInsert }
  const updateChain = {
    set: () => ({ where: hoisted.mockDbUpdate }),
  }
  return {
    db: {
      query: hoisted.mockDbQuery,
      insert: () => insertChain,
      update: () => updateChain,
    },
    invitation: {
      id: 'id',
      email: 'email',
      kind: 'kind',
      status: 'status',
    },
    principal: { userId: 'userId', role: 'role', id: 'id' },
    user: { email: 'email', id: 'id' },
    eq: vi.fn((col, val) => ({ col, val })),
    and: vi.fn((...args: unknown[]) => args),
    or: vi.fn((...args: unknown[]) => args),
    sql: vi.fn((parts: TemplateStringsArray) => parts.raw[0]),
  }
})

vi.mock('@quackback/email', () => ({
  sendPortalInviteEmail: hoisted.mockSendPortalInviteEmail,
}))

vi.mock('@/lib/server/config', () => ({
  getBaseUrl: hoisted.mockGetBaseUrl,
}))

vi.mock('@quackback/ids', () => ({
  generateId: hoisted.mockGenerateId,
}))

// Dynamic imports used inside handlers
vi.mock('@/lib/server/auth/magic-link-mint', () => ({
  mintMagicLinkUrl: hoisted.mockMintMagicLinkUrl,
}))

vi.mock('@/lib/server/storage/s3', () => ({
  getEmailSafeUrl: hoisted.mockGetEmailSafeUrl,
}))

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Handler indices in the order portal-invites.ts registers them.
const SEND_IDX = 0
const CANCEL_IDX = 1
const RESEND_IDX = 2
const FETCH_IDX = 3

const ADMIN_AUTH = {
  user: { id: 'user_admin', email: 'admin@acme.com', name: 'Admin' },
  principal: { id: 'principal_admin', role: 'admin', type: 'user' },
  settings: { id: 'ws_1', slug: 'acme', name: 'Acme', logoKey: null },
}

// Load the module once so handlers[] is populated
let sendHandler: AnyHandler
let cancelHandler: AnyHandler
let resendHandler: AnyHandler
let fetchHandler: NoArgHandler

beforeEach(async () => {
  vi.clearAllMocks()

  if (handlers.length === 0) {
    await import('../portal-invites')
  }

  sendHandler = handlers[SEND_IDX] as AnyHandler
  cancelHandler = handlers[CANCEL_IDX] as AnyHandler
  resendHandler = handlers[RESEND_IDX] as AnyHandler
  fetchHandler = handlers[FETCH_IDX] as NoArgHandler

  // Sensible defaults
  hoisted.mockRequireAuth.mockResolvedValue(ADMIN_AUTH)
  hoisted.mockGetBaseUrl.mockReturnValue('https://acme.example.com')
  hoisted.mockMintMagicLinkUrl.mockResolvedValue(
    'https://acme.example.com/verify-magic-link?token=abc'
  )
  hoisted.mockGetEmailSafeUrl.mockReturnValue(null)
  hoisted.mockSendPortalInviteEmail.mockResolvedValue({ sent: false })
  hoisted.mockGenerateId.mockReturnValue('invite_test')
  hoisted.mockDbInsert.mockResolvedValue(undefined)
  hoisted.mockDbUpdate.mockResolvedValue(undefined)

  // Default: no existing user/invite
  hoisted.mockDbQuery.user.findFirst.mockResolvedValue(null)
  hoisted.mockDbQuery.principal.findFirst.mockResolvedValue(null)
  hoisted.mockDbQuery.invitation.findFirst.mockResolvedValue(null)
  hoisted.mockDbQuery.invitation.findMany.mockResolvedValue([])
  hoisted.mockRecordAuditEvent.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// sendPortalInviteFn
// ---------------------------------------------------------------------------

describe('sendPortalInviteFn — auth gate', () => {
  it('rejects non-admin callers', async () => {
    hoisted.mockRequireAuth.mockRejectedValue(new Error('Access denied: Requires [admin]'))
    await expect(sendHandler({ data: { email: 'user@example.com' } })).rejects.toThrow(
      'Access denied'
    )
  })
})

describe('sendPortalInviteFn — validation', () => {
  it('rejects when email belongs to a team member (admin)', async () => {
    hoisted.mockDbQuery.user.findFirst.mockResolvedValue({ id: 'user_1' })
    hoisted.mockDbQuery.principal.findFirst.mockResolvedValue({ role: 'admin' })

    await expect(sendHandler({ data: { email: 'admin@acme.com' } })).rejects.toThrow(
      'already a team member'
    )
  })

  it('rejects when email belongs to a team member (member)', async () => {
    hoisted.mockDbQuery.user.findFirst.mockResolvedValue({ id: 'user_1' })
    hoisted.mockDbQuery.principal.findFirst.mockResolvedValue({ role: 'member' })

    await expect(sendHandler({ data: { email: 'member@acme.com' } })).rejects.toThrow(
      'already a team member'
    )
  })

  it('allows invite when user exists as role=user (portal user)', async () => {
    hoisted.mockDbQuery.user.findFirst.mockResolvedValue({ id: 'user_1' })
    hoisted.mockDbQuery.principal.findFirst.mockResolvedValue({ role: 'user' })

    const result = await sendHandler({ data: { email: 'portaluser@example.com' } })
    expect((result as { inviteId: string }).inviteId).toBe('invite_test')
  })

  it('rejects when a pending portal invite already exists', async () => {
    hoisted.mockDbQuery.user.findFirst.mockResolvedValue(null)
    hoisted.mockDbQuery.invitation.findFirst.mockResolvedValue({
      id: 'invite_existing',
      status: 'pending',
      kind: 'portal',
    })

    await expect(sendHandler({ data: { email: 'someone@example.com' } })).rejects.toThrow(
      'pending portal invitation has already been sent'
    )
  })
})

describe('sendPortalInviteFn — success', () => {
  it('inserts a row with kind=portal and status=pending', async () => {
    await sendHandler({ data: { email: 'newuser@example.com' } })

    const insertCall = hoisted.mockDbInsert.mock.calls[0][0] as Record<string, unknown>
    expect(insertCall.kind).toBe('portal')
    expect(insertCall.status).toBe('pending')
    expect(insertCall.role).toBeNull()
    expect(insertCall.email).toBe('newuser@example.com')
    expect(insertCall.inviterId).toBe(ADMIN_AUTH.user.id)
  })

  it('normalizes the email to lowercase', async () => {
    await sendHandler({ data: { email: 'MixedCase@EXAMPLE.COM' } })

    const insertCall = hoisted.mockDbInsert.mock.calls[0][0] as Record<string, unknown>
    expect(insertCall.email).toBe('mixedcase@example.com')
  })

  it('calls sendPortalInviteEmail with the magic link', async () => {
    hoisted.mockSendPortalInviteEmail.mockResolvedValue({ sent: true })

    await sendHandler({ data: { email: 'invitee@example.com' } })

    expect(hoisted.mockSendPortalInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'invitee@example.com',
        workspaceName: ADMIN_AUTH.settings.name,
      })
    )
  })

  it('records a portal.invite.sent audit event', async () => {
    await sendHandler({ data: { email: 'invitee@example.com' } })

    const auditCall = hoisted.mockRecordAuditEvent.mock.calls.find(
      (c) => (c[0] as { event: string }).event === 'portal.invite.sent'
    )
    expect(auditCall).toBeDefined()
  })

  it('returns inviteId', async () => {
    const result = await sendHandler({ data: { email: 'invitee@example.com' } })
    expect((result as { inviteId: string }).inviteId).toBe('invite_test')
  })

  it('returns inviteLink when email is not configured', async () => {
    hoisted.mockSendPortalInviteEmail.mockResolvedValue({ sent: false })

    const result = await sendHandler({ data: { email: 'invitee@example.com' } })
    const r = result as { emailSent: boolean; inviteLink?: string }
    expect(r.emailSent).toBe(false)
    expect(r.inviteLink).toBeDefined()
  })

  it('does NOT return inviteLink when email is sent', async () => {
    hoisted.mockSendPortalInviteEmail.mockResolvedValue({ sent: true })

    const result = await sendHandler({ data: { email: 'invitee@example.com' } })
    const r = result as { emailSent: boolean; inviteLink?: string }
    expect(r.emailSent).toBe(true)
    expect(r.inviteLink).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// cancelPortalInviteFn
// ---------------------------------------------------------------------------

describe('cancelPortalInviteFn — auth gate', () => {
  it('rejects non-admin callers', async () => {
    hoisted.mockRequireAuth.mockRejectedValue(new Error('Access denied'))
    await expect(cancelHandler({ data: { inviteId: 'invite_1' } })).rejects.toThrow('Access denied')
  })
})

describe('cancelPortalInviteFn — validation', () => {
  it('throws when invite is not found', async () => {
    hoisted.mockDbQuery.invitation.findFirst.mockResolvedValue(null)

    await expect(cancelHandler({ data: { inviteId: 'invite_missing' } })).rejects.toThrow(
      'not found'
    )
  })

  it('throws when invite is already accepted (non-pending)', async () => {
    hoisted.mockDbQuery.invitation.findFirst.mockResolvedValue({
      id: 'invite_1',
      kind: 'portal',
      status: 'accepted',
      email: 'user@example.com',
    })

    await expect(cancelHandler({ data: { inviteId: 'invite_1' } })).rejects.toThrow('already')
  })

  it('throws when kind is not portal (wrong kind guard)', async () => {
    // findFirst returns null because query includes kind='portal' filter in the handler
    hoisted.mockDbQuery.invitation.findFirst.mockResolvedValue(null)

    await expect(cancelHandler({ data: { inviteId: 'invite_team_1' } })).rejects.toThrow(
      'not found'
    )
  })
})

describe('cancelPortalInviteFn — success', () => {
  it('updates status to canceled', async () => {
    hoisted.mockDbQuery.invitation.findFirst.mockResolvedValue({
      id: 'invite_1',
      kind: 'portal',
      status: 'pending',
      email: 'user@example.com',
    })

    await cancelHandler({ data: { inviteId: 'invite_1' } })

    expect(hoisted.mockDbUpdate).toHaveBeenCalled()
  })

  it('records a portal.invite.revoked audit event', async () => {
    hoisted.mockDbQuery.invitation.findFirst.mockResolvedValue({
      id: 'invite_1',
      kind: 'portal',
      status: 'pending',
      email: 'user@example.com',
    })

    await cancelHandler({ data: { inviteId: 'invite_1' } })

    const auditCall = hoisted.mockRecordAuditEvent.mock.calls.find(
      (c) => (c[0] as { event: string }).event === 'portal.invite.revoked'
    )
    expect(auditCall).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// resendPortalInviteFn
// ---------------------------------------------------------------------------

describe('resendPortalInviteFn — validation', () => {
  it('throws when invite is not found or not pending', async () => {
    hoisted.mockDbQuery.invitation.findFirst.mockResolvedValue(null)

    await expect(resendHandler({ data: { inviteId: 'invite_gone' } })).rejects.toThrow(
      'not found or is not pending'
    )
  })

  it('throws when invite is expired', async () => {
    const pastDate = new Date(Date.now() - 1000)
    hoisted.mockDbQuery.invitation.findFirst.mockResolvedValue({
      id: 'invite_1',
      kind: 'portal',
      status: 'pending',
      email: 'user@example.com',
      expiresAt: pastDate,
    })

    await expect(resendHandler({ data: { inviteId: 'invite_1' } })).rejects.toThrow('expired')
  })
})

describe('resendPortalInviteFn — success', () => {
  it('mints a new magic link and sends the email', async () => {
    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    hoisted.mockDbQuery.invitation.findFirst.mockResolvedValue({
      id: 'invite_1',
      kind: 'portal',
      status: 'pending',
      email: 'user@example.com',
      expiresAt: futureDate,
    })
    hoisted.mockSendPortalInviteEmail.mockResolvedValue({ sent: true })

    const result = await resendHandler({ data: { inviteId: 'invite_1' } })

    expect(hoisted.mockMintMagicLinkUrl).toHaveBeenCalled()
    expect(hoisted.mockSendPortalInviteEmail).toHaveBeenCalled()
    expect((result as { inviteId: string }).inviteId).toBe('invite_1')
  })

  it('records portal.invite.sent on resend', async () => {
    const futureDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    hoisted.mockDbQuery.invitation.findFirst.mockResolvedValue({
      id: 'invite_1',
      kind: 'portal',
      status: 'pending',
      email: 'user@example.com',
      expiresAt: futureDate,
    })

    await resendHandler({ data: { inviteId: 'invite_1' } })

    const sentEvent = hoisted.mockRecordAuditEvent.mock.calls.find(
      (c) => (c[0] as { event: string }).event === 'portal.invite.sent'
    )
    expect(sentEvent).toBeDefined()
    // resend flag in metadata
    const meta = (sentEvent![0] as { metadata?: { resend?: boolean } }).metadata
    expect(meta?.resend).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// fetchPortalInvitesFn
// ---------------------------------------------------------------------------

describe('fetchPortalInvitesFn', () => {
  it('rejects non-admin callers', async () => {
    hoisted.mockRequireAuth.mockRejectedValue(new Error('Access denied'))
    await expect((fetchHandler as () => Promise<unknown>)()).rejects.toThrow('Access denied')
  })

  it('returns only kind=portal rows (findMany is called)', async () => {
    const mockRows = [
      {
        id: 'invite_1',
        email: 'a@example.com',
        status: 'pending',
        kind: 'portal',
        createdAt: new Date('2026-05-01'),
        lastSentAt: new Date('2026-05-01'),
        expiresAt: new Date('2026-05-15'),
      },
    ]
    hoisted.mockDbQuery.invitation.findMany.mockResolvedValue(mockRows)

    const result = await (fetchHandler as () => Promise<unknown>)()
    const items = result as { id: string; kind: string }[]

    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('invite_1')
    expect(items[0].kind).toBe('portal')
  })

  it('serializes dates to ISO strings', async () => {
    const date = new Date('2026-05-01T12:00:00.000Z')
    hoisted.mockDbQuery.invitation.findMany.mockResolvedValue([
      {
        id: 'invite_1',
        email: 'a@example.com',
        status: 'pending',
        kind: 'portal',
        createdAt: date,
        lastSentAt: date,
        expiresAt: date,
      },
    ])

    const result = await (fetchHandler as () => Promise<unknown>)()
    const item = (result as { createdAt: string }[])[0]

    expect(item.createdAt).toBe('2026-05-01T12:00:00.000Z')
  })

  it('returns empty array when no portal invites exist', async () => {
    hoisted.mockDbQuery.invitation.findMany.mockResolvedValue([])

    const result = await (fetchHandler as () => Promise<unknown>)()
    expect(result).toEqual([])
  })
})
