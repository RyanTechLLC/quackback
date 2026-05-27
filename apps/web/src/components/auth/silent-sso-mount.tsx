/**
 * Mount-point for the silent-SSO attempt. Drop this into a route's
 * component tree (landing page, /login, /admin/login, etc.) and it
 * pulls the workspace's `registeredAuthProviders` + current session
 * out of the root route context and triggers `useSilentSso` once per
 * tab / page-load.
 *
 * Renders nothing — the actual mechanics live in the hook and the
 * hidden iframe it injects into document.body. Kept as a component
 * (rather than calling the hook directly in every route) so the
 * gating logic — "does this workspace even have SSO?" / "is the user
 * already signed in?" — has exactly one home.
 */
import { useRouteContext } from '@tanstack/react-router'
import type { RouterContext } from '@/routes/__root'
import { useSilentSso } from '@/lib/client/hooks/use-silent-sso'

export function SilentSsoMount() {
  const ctx = useRouteContext({ from: '__root__' }) as RouterContext
  const enabled = !!ctx.registeredAuthProviders?.includes('sso')
  const signedIn = !!ctx.session?.user
  useSilentSso({ enabled, signedIn })
  return null
}
