import type { SetupState } from '@/lib/shared/db-types'

interface OnboardingStateInput {
  needsInvitation?: boolean
  setupState: SetupState | null
  principalRecord: { id: string; role: string } | null
}

interface PickStepInput {
  session: { userId: string } | null
  state: OnboardingStateInput | null
}

/** Step targets the onboarding flow can route to. Pure string union so
 *  the loader can swap between server-fn redirects and tests can assert. */
export type OnboardingStep =
  | '/admin'
  | '/auth/login'
  | '/onboarding/account'
  | '/onboarding/boards'
  | '/onboarding/usecase'
  | '/onboarding/workspace'

export function pickOnboardingStep({ session, state }: PickStepInput): OnboardingStep {
  if (!session?.userId) return '/onboarding/account'
  if (!state) return '/onboarding/usecase'

  if (state.needsInvitation) return '/auth/login'

  // Route to the FIRST incomplete step. Even cloud-source tenants need
  // a useCase before the dashboard can render the right inbox/widget
  // defaults — the cloud signup form can omit it, so don't drop the
  // user past /onboarding/usecase.
  if (!state.setupState?.useCase) return '/onboarding/usecase'
  if (!state.setupState?.steps?.workspace) return '/onboarding/workspace'

  // Cloud-source admins finish at /admin instead of /onboarding/boards
  // — the CP already pre-stamped the workspace + chose a useCase via
  // /api/v1/admin/setup, and OIDC sign-in promoted them to admin. The
  // boards step is optional (the dashboard handles empty boards as an
  // empty-state hint), so keep it for self-hosted only where the user
  // is creating their first board as part of the onboarding pass.
  if (state.setupState?.source === 'cloud' && state.principalRecord?.role === 'admin') {
    return '/admin'
  }

  return '/onboarding/boards'
}
