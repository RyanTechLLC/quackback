/**
 * getNestedClaim + resolveSsoRole — pure helpers for IdP-attribute-
 * driven role assignment. Tested separately because the logic has
 * lots of branches and ID tokens have lots of shapes (dotted nested
 * objects, URL-shaped namespaced claims, arrays vs scalars, missing
 * values, etc.).
 */
import { describe, it, expect } from 'vitest'
import { getNestedClaim, resolveSsoRole } from '../resolve-sso-role'
import type { AuthConfig } from '@/lib/server/domains/settings/settings.types'

describe('getNestedClaim', () => {
  it('reads a dotted path', () => {
    expect(getNestedClaim({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42)
  })

  it('reads a single-segment key', () => {
    expect(getNestedClaim({ groups: ['admins'] }, 'groups')).toEqual(['admins'])
  })

  it('reads a URL-shaped namespaced claim path literally', () => {
    const claims = { 'https://acme.com/roles': ['platform-admins'] }
    expect(getNestedClaim(claims, 'https://acme.com/roles')).toEqual(['platform-admins'])
  })

  it('reads a Keycloak-style realm_access.roles dotted path', () => {
    const claims = { realm_access: { roles: ['admin', 'developer'] } }
    expect(getNestedClaim(claims, 'realm_access.roles')).toEqual(['admin', 'developer'])
  })

  it('returns undefined for missing paths', () => {
    expect(getNestedClaim({ a: 1 }, 'b')).toBeUndefined()
    expect(getNestedClaim({ a: { b: 1 } }, 'a.c')).toBeUndefined()
    expect(getNestedClaim({ a: null }, 'a.b')).toBeUndefined()
  })

  it('returns undefined for non-object intermediate values', () => {
    expect(getNestedClaim({ a: 5 }, 'a.b')).toBeUndefined()
    expect(getNestedClaim({ a: 'string' }, 'a.b')).toBeUndefined()
  })
})

const mapping = (
  rules: Array<{ whenContains: string; role: 'admin' | 'member' | 'user' }>,
  defaultRole: 'admin' | 'member' | 'user' = 'member'
): NonNullable<AuthConfig['ssoOidc']>['attributeMapping'] => ({
  claimPath: 'groups',
  rules,
  defaultRole,
})

describe('resolveSsoRole', () => {
  it('returns the first-match-wins role for an array claim', () => {
    const role = resolveSsoRole(
      { groups: ['analysts', 'platform-admins'] },
      mapping([
        { whenContains: 'platform-admins', role: 'admin' },
        { whenContains: 'analysts', role: 'member' },
      ])
    )
    expect(role).toBe('admin')
  })

  it('matches a scalar claim with whenContains equality', () => {
    const role = resolveSsoRole(
      { groups: 'platform-admin' },
      mapping([{ whenContains: 'platform-admin', role: 'admin' }])
    )
    expect(role).toBe('admin')
  })

  it('falls back to defaultRole when no rule matches', () => {
    const role = resolveSsoRole(
      { groups: ['support'] },
      mapping([{ whenContains: 'admins', role: 'admin' }], 'user')
    )
    expect(role).toBe('user')
  })

  it('falls back to defaultRole when the claim is missing', () => {
    const role = resolveSsoRole({}, mapping([{ whenContains: 'admins', role: 'admin' }], 'member'))
    expect(role).toBe('member')
  })

  it('is case-insensitive when matching', () => {
    const role = resolveSsoRole(
      { groups: ['Platform-Admins'] },
      mapping([{ whenContains: 'platform-admins', role: 'admin' }])
    )
    expect(role).toBe('admin')
  })

  it('handles URL-shaped claim paths', () => {
    const role = resolveSsoRole(
      { 'https://acme.com/roles': ['platform-admins'] },
      {
        claimPath: 'https://acme.com/roles',
        rules: [{ whenContains: 'platform-admins', role: 'admin' }],
        defaultRole: 'member',
      }
    )
    expect(role).toBe('admin')
  })

  it('returns null when no mapping is provided', () => {
    expect(resolveSsoRole({ groups: ['admin'] }, undefined)).toBeNull()
  })

  // Pins the InterpriseOne integration shape so a future refactor of
  // either resolver can't silently break the role auto-assignment that
  // tenants relying on InterpriseOne as their IdP depend on. The IdP's
  // `oidcProvider` config exposes the user's internal role via
  // `getAdditionalUserInfoClaim` as a scalar string `internal_role`
  // (values: OWNER / TENANT_ADMIN / ADMIN / USER per its `roles.ts`).
  // The corresponding Quackback mapping uses claimPath='internal_role'
  // with one rule per IdP role that should be promoted above the
  // defaultRole (which keeps casual InterpriseOne users in the
  // Quackback `user` portal-only bucket).
  describe('InterpriseOne integration shape', () => {
    const interpriseOneMapping: NonNullable<AuthConfig['ssoOidc']>['attributeMapping'] = {
      claimPath: 'internal_role',
      rules: [
        { whenContains: 'OWNER', role: 'admin' },
        { whenContains: 'TENANT_ADMIN', role: 'admin' },
        { whenContains: 'ADMIN', role: 'member' },
      ],
      defaultRole: 'user',
    }

    it('promotes an OWNER to admin', () => {
      expect(resolveSsoRole({ internal_role: 'OWNER' }, interpriseOneMapping)).toBe('admin')
    })

    it('promotes a TENANT_ADMIN to admin', () => {
      expect(resolveSsoRole({ internal_role: 'TENANT_ADMIN' }, interpriseOneMapping)).toBe('admin')
    })

    it('promotes a plain ADMIN to member', () => {
      expect(resolveSsoRole({ internal_role: 'ADMIN' }, interpriseOneMapping)).toBe('member')
    })

    it('keeps a plain USER on the portal-only default role', () => {
      expect(resolveSsoRole({ internal_role: 'USER' }, interpriseOneMapping)).toBe('user')
    })

    it("falls through to the default when InterpriseOne doesn't emit the claim", () => {
      // Older InterpriseOne deploys (or tenants who haven't enabled
      // `getAdditionalUserInfoClaim`) would send an id_token without
      // `internal_role`. The default role keeps them signed in as
      // portal-only; an admin can promote manually after the fact.
      expect(resolveSsoRole({ sub: '123', email: 'x@y.z' }, interpriseOneMapping)).toBe('user')
    })
  })
})
