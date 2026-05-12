/**
 * Pure predicate deciding whether a password sign-in attempt should
 * be redirected to `/auth/two-factor-setup-required`.
 *
 * Three inputs, no DB / no network — kept side-effect-free so the
 * `hooksBefore` gate can stay readable and the rule is exhaustively
 * testable. The caller (the gate) is responsible for resolving each
 * field from the live request:
 *   - `role` — from `principal.role` looked up by email
 *   - `userHas2FA` — `user.twoFactorEnabled === true`
 *   - `workspaceRequired` — `authConfig.twoFactor?.required === true`
 *
 * Policy:
 *   - Toggle off            → false (open, today's behaviour)
 *   - Portal user (role)    → false (only team roles are gated)
 *   - Team role + enrolled  → false (2FA challenge happens elsewhere)
 *   - Team role + missing   → true  (block; redirect to setup landing)
 */
export function shouldRequire2FA(input: {
  role: 'admin' | 'member' | 'user'
  userHas2FA: boolean
  workspaceRequired: boolean
}): boolean {
  if (!input.workspaceRequired) return false
  if (input.role === 'user') return false
  return !input.userHas2FA
}
