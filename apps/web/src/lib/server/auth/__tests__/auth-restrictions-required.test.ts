/**
 * isHardBound — policy predicate combining the per-domain enforced
 * branch with the workspace-wide ssoOidc.required branch.
 *
 *  - Workspace-wide branch fires for admin/member when
 *    authConfig.ssoOidc.required === true
 *  - Magic-link escapes when allowMagicLinkUnderRequired === true
 *  - Portal users (role='user') never hard-bound by workspace-wide
 *  - Per-domain branch still works when workspace-wide is off
 *  - OR semantics: either branch true means hard-bound
 */
import { describe, it, expect } from 'vitest'
import { isHardBound } from '../auth-restrictions'
import type { AuthConfig, VerifiedDomain } from '@/lib/server/domains/settings/settings.types'

const baseConfig: AuthConfig = {
  oauth: { password: true },
  openSignup: false,
}

const enforcedDomain: VerifiedDomain = {
  id: 'domain_acme' as `domain_${string}`,
  name: 'acme.com',
  verificationToken: 'tok',
  verifiedAt: '2026-05-01T00:00:00.000Z',
  enforced: true,
  createdAt: '2026-05-01T00:00:00.000Z',
}

const verifiedDomain: VerifiedDomain = { ...enforcedDomain, enforced: false }

describe('isHardBound — workspace-wide branch', () => {
  it('blocks credential for admin when ssoOidc.required=true', () => {
    expect(
      isHardBound(
        'credential',
        'foo@example.com',
        'admin',
        { ...baseConfig, ssoOidc: { enabled: true, required: true } as never },
        []
      )
    ).toBe(true)
  })

  it('blocks magic-link for member when ssoOidc.required=true', () => {
    expect(
      isHardBound(
        'magic-link',
        'foo@example.com',
        'member',
        { ...baseConfig, ssoOidc: { enabled: true, required: true } as never },
        []
      )
    ).toBe(true)
  })

  it('still allows magic-link when allowMagicLinkUnderRequired=true', () => {
    expect(
      isHardBound(
        'magic-link',
        'foo@example.com',
        'admin',
        {
          ...baseConfig,
          ssoOidc: {
            enabled: true,
            required: true,
            allowMagicLinkUnderRequired: true,
          } as never,
        },
        []
      )
    ).toBe(false)
  })

  it('does NOT bind portal user (role=user) when required=true', () => {
    expect(
      isHardBound(
        'credential',
        'foo@example.com',
        'user',
        { ...baseConfig, ssoOidc: { enabled: true, required: true } as never },
        []
      )
    ).toBe(false)
  })

  it('does nothing when required=false / undefined', () => {
    expect(
      isHardBound(
        'credential',
        'foo@example.com',
        'admin',
        { ...baseConfig, ssoOidc: { enabled: true, required: false } as never },
        []
      )
    ).toBe(false)
    expect(isHardBound('credential', 'foo@example.com', 'admin', baseConfig, [])).toBe(false)
  })
})

describe('isHardBound — per-domain branch (regression)', () => {
  it('still blocks emails at enforced verified domains', () => {
    expect(isHardBound('credential', 'a@acme.com', 'admin', baseConfig, [enforcedDomain])).toBe(
      true
    )
  })

  it('does NOT block when verified domain has enforced=false', () => {
    expect(isHardBound('credential', 'a@acme.com', 'admin', baseConfig, [verifiedDomain])).toBe(
      false
    )
  })
})

describe('isHardBound — OR semantics', () => {
  it('returns true when both branches would block', () => {
    expect(
      isHardBound(
        'credential',
        'a@acme.com',
        'admin',
        { ...baseConfig, ssoOidc: { enabled: true, required: true } as never },
        [enforcedDomain]
      )
    ).toBe(true)
  })

  it('returns true when only the workspace-wide branch blocks', () => {
    expect(
      isHardBound(
        'credential',
        'a@example.com',
        'admin',
        { ...baseConfig, ssoOidc: { enabled: true, required: true } as never },
        []
      )
    ).toBe(true)
  })

  it('returns true when only the per-domain branch blocks', () => {
    expect(isHardBound('credential', 'a@acme.com', 'admin', baseConfig, [enforcedDomain])).toBe(
      true
    )
  })
})

describe('isHardBound — non-hard-bound providers', () => {
  it('returns false for sso', () => {
    expect(
      isHardBound(
        'sso',
        'a@example.com',
        'admin',
        { ...baseConfig, ssoOidc: { enabled: true, required: true } as never },
        []
      )
    ).toBe(false)
  })

  it('returns false for google', () => {
    expect(
      isHardBound(
        'google',
        'a@example.com',
        'admin',
        { ...baseConfig, ssoOidc: { enabled: true, required: true } as never },
        []
      )
    ).toBe(false)
  })
})
