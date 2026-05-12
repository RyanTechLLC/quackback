/**
 * Tests for `handleAutoProvisionAfter` role assignment.
 *
 * Phase 1, Task 1.2: the JIT auto-provision hook must read
 * `authConfig.ssoOidc.autoProvisionRole` and use it as the target role,
 * defaulting to 'member' for backwards compatibility. Setting 'user'
 * explicitly disables promotion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindFirst = vi.fn()
const mockSet = vi.fn()
const mockWhere = vi.fn()

vi.mock('@/lib/server/db', () => ({
  db: {
    query: { principal: { findFirst: (...args: unknown[]) => mockFindFirst(...args) } },
    update: () => ({ set: mockSet, where: mockWhere }),
  },
  principal: { userId: 'user_id', role: 'role' },
  eq: vi.fn(),
}))

vi.mock('../auth-restrictions', () => ({
  isEmailAtVerifiedDomain: () => true,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockSet.mockReturnValue({ where: mockWhere })
  mockWhere.mockResolvedValue(undefined)
})

const callHandler = async (autoProvisionRole?: 'admin' | 'member' | 'user') => {
  const mod = (await import('../hooks')) as typeof import('../hooks') & {
    handleAutoProvisionAfter?: (
      ctx: {
        path?: string
        params?: Record<string, unknown>
        context?: { newSession?: { user?: { id?: string; email?: string } } }
      },
      tenant: Record<string, unknown>
    ) => Promise<void>
  }
  const handler = mod.handleAutoProvisionAfter
  if (!handler) throw new Error('handleAutoProvisionAfter must be exported for testing')
  await handler(
    {
      path: '/oauth2/callback/:providerId',
      params: { providerId: 'sso' },
      context: { newSession: { user: { id: 'user_abc', email: 'alice@acme.com' } } },
    },
    {
      authConfig: {
        ssoOidc: {
          enabled: true,
          discoveryUrl: 'https://idp/well-known',
          clientId: 'c',
          autoCreateUsers: true,
          autoProvisionRole,
        },
      },
      verifiedDomains: [
        {
          id: 'domain_1',
          name: 'acme.com',
          verificationToken: 't',
          verifiedAt: '2026-01-01',
          enforced: false,
          createdAt: '2026-01-01',
        },
      ],
    }
  )
}

describe('handleAutoProvisionAfter -- role assignment', () => {
  it('uses autoProvisionRole=admin from config', async () => {
    mockFindFirst.mockResolvedValue({ role: 'user' })
    await callHandler('admin')
    expect(mockSet).toHaveBeenCalledWith({ role: 'admin' })
  })

  it('uses autoProvisionRole=member from config', async () => {
    mockFindFirst.mockResolvedValue({ role: 'user' })
    await callHandler('member')
    expect(mockSet).toHaveBeenCalledWith({ role: 'member' })
  })

  it('defaults to member when autoProvisionRole is undefined', async () => {
    mockFindFirst.mockResolvedValue({ role: 'user' })
    await callHandler(undefined)
    expect(mockSet).toHaveBeenCalledWith({ role: 'member' })
  })

  it('does not promote when autoProvisionRole=user (portal-only)', async () => {
    mockFindFirst.mockResolvedValue({ role: 'user' })
    await callHandler('user')
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('does not downgrade existing admin/member', async () => {
    mockFindFirst.mockResolvedValue({ role: 'admin' })
    await callHandler('member')
    expect(mockSet).not.toHaveBeenCalled()
  })
})
