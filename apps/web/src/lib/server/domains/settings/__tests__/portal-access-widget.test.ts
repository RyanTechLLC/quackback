/**
 * Unit tests for the Phase 4 widget grant branch in evaluatePortalAccess().
 *
 * Pure function — no DB, no mocks needed.
 */
import { describe, it, expect } from 'vitest'
import { evaluatePortalAccess } from '../portal-access'

const BASE = {
  visibility: 'private' as const,
  role: 'user' as const,
  isAuthenticated: true,
  userEmail: 'user@example.com',
  emailVerified: true,
  allowedDomains: [],
}

describe('evaluatePortalAccess — widget sign-in grant', () => {
  it('grants via widget when widgetSignIn=true, authenticated, role=user', () => {
    const result = evaluatePortalAccess({ ...BASE, widgetSignInEnabled: true })
    expect(result.granted).toBe(true)
    if (result.granted) expect(result.reason).toBe('widget')
  })

  it('denies (unauthorized) when widgetSignIn=false, same user', () => {
    const result = evaluatePortalAccess({ ...BASE, widgetSignInEnabled: false })
    expect(result.granted).toBe(false)
    if (!result.granted) expect(result.reason).toBe('unauthorized')
  })

  it('denies when widgetSignIn=true but NOT authenticated', () => {
    const result = evaluatePortalAccess({
      ...BASE,
      widgetSignInEnabled: true,
      isAuthenticated: false,
    })
    expect(result.granted).toBe(false)
    if (!result.granted) expect(result.reason).toBe('unauthenticated')
  })

  it('defaults widgetSignInEnabled=false when omitted — existing callers unaffected', () => {
    // No widgetSignInEnabled key at all.
    const result = evaluatePortalAccess({ ...BASE })
    expect(result.granted).toBe(false)
    if (!result.granted) expect(result.reason).toBe('unauthorized')
  })

  it('team grant takes precedence over widget (team checked first)', () => {
    const result = evaluatePortalAccess({
      ...BASE,
      role: 'admin',
      widgetSignInEnabled: true,
    })
    expect(result.granted).toBe(true)
    if (result.granted) expect(result.reason).toBe('team')
  })

  it('domain grant takes precedence over widget (domain checked before widget)', () => {
    const result = evaluatePortalAccess({
      ...BASE,
      role: 'user',
      emailVerified: true,
      userEmail: 'user@acme.com',
      allowedDomains: ['acme.com'],
      widgetSignInEnabled: true,
    })
    expect(result.granted).toBe(true)
    if (result.granted) expect(result.reason).toBe('domain')
  })

  it('invite grant takes precedence over widget (invite checked before widget)', () => {
    const result = evaluatePortalAccess({
      ...BASE,
      widgetSignInEnabled: true,
      hasAcceptedPortalInvite: true,
    })
    expect(result.granted).toBe(true)
    if (result.granted) expect(result.reason).toBe('invite')
  })

  it('does NOT grant via widget when role is not user (admin already granted via team branch)', () => {
    // Admin should be granted via team branch, not widget.
    const result = evaluatePortalAccess({
      ...BASE,
      role: 'admin',
      widgetSignInEnabled: true,
    })
    expect(result.granted).toBe(true)
    if (result.granted) expect(result.reason).toBe('team')
  })

  it('public portal is still granted regardless of widgetSignIn setting', () => {
    const result = evaluatePortalAccess({
      ...BASE,
      visibility: 'public',
      widgetSignInEnabled: false,
    })
    expect(result.granted).toBe(true)
    if (result.granted) expect(result.reason).toBe('public')
  })
})

describe('PortalAccessResult discriminant — widget reason', () => {
  it('reason discriminant narrowing works for widget grant', () => {
    const result = evaluatePortalAccess({ ...BASE, widgetSignInEnabled: true })
    if (result.granted && result.reason === 'widget') {
      // TypeScript narrowing check — this line must compile.
      const _reason: 'widget' = result.reason
      expect(_reason).toBe('widget')
    }
  })
})
