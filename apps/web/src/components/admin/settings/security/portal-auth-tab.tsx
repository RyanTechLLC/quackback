import { useState, useTransition } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  ArrowPathIcon,
  EnvelopeIcon,
  KeyIcon,
  ShieldCheckIcon,
  LockClosedIcon,
} from '@heroicons/react/24/solid'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { MethodRow } from '@/components/admin/settings/auth-shared/method-row'
import { OAuthProviderGrid } from '@/components/admin/settings/auth-shared/oauth-provider-grid'
import { AuthProviderCredentialsDialog } from '@/components/admin/settings/portal-auth/auth-provider-credentials-dialog'
import { AUTH_PROVIDERS } from '@/lib/shared/auth-providers'
import { updatePortalConfigFn } from '@/lib/server/functions/settings'
import { isPathManagedFromBootstrap } from '@/lib/client/config-file'
import { useRouteContext } from '@tanstack/react-router'
import { cn } from '@/lib/shared/utils'
import type { PortalAuthMethods } from '@/lib/shared/types'

interface PortalAuthTabProps {
  initialOauth: PortalAuthMethods
  credentialStatus: Record<string, boolean> & { _emailConfigured?: boolean }
  customOidcProviderTier: boolean
  /** True when the workspace's SSO IdP is configured + enabled
   *  (`authConfig.ssoOidc.enabled === true`). When true, the legacy
   *  Custom OIDC card is replaced by a deprecation banner pointing
   *  at the unified SSO settings page — `sso` already surfaces as a
   *  portal sign-in button via `getEnabledOAuthProviders` so there's
   *  no reason for an admin to keep maintaining a duplicate
   *  `auth_custom-oidc` credentials row. */
  ssoEnabled: boolean
}

/**
 * Portal sign-in tab inside the unified Authentication page.
 *
 * Mirrors the previous standalone /admin/settings/portal-auth page but
 * inlined here so admins don't have to navigate to two separate places
 * to compare team vs portal config. Uses the same `<OAuthProviderGrid>`
 * the Team tab does — clicking "Configure" on any provider opens the
 * shared `AuthProviderCredentialsDialog` (one row in
 * `platform_credentials` powers both surfaces).
 *
 * Differences from the Team tab:
 *  - No SSO card (SSO is admin-only by design — IdPs typically issue
 *    one client secret per Quackback deployment, scoped to team admins
 *    rather than end users).
 *  - Magic Link defaults to off; password defaults to on.
 *  - No enforcement / bootstrap guard — portal is opt-in self-service.
 *
 * The `Sign-in Methods` card includes an explicit info row pointing
 * users to the Team tab for SSO so the absence isn't silent.
 */
export function PortalAuthTab({
  initialOauth,
  credentialStatus,
  customOidcProviderTier,
  ssoEnabled,
}: PortalAuthTabProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [oauthState, setOauthState] = useState<Record<string, boolean | undefined>>(initialOauth)

  const { managedFieldPaths = [] } =
    (useRouteContext({ from: '__root__' }) as { managedFieldPaths?: string[] }) ?? {}
  const isManaged = (path: string) => isPathManagedFromBootstrap(path, managedFieldPaths)

  const emailConfigured = credentialStatus._emailConfigured !== false
  const passwordEnabled = oauthState.password ?? true
  const magicLinkEnabled = oauthState.magicLink ?? false

  // Last-enabled-method guard. Portal has no locked-on method, so we
  // refuse to disable the only remaining one. Legacy `email` flag is
  // excluded — migration 0049 retired it in favour of magicLink.
  const enabledMethodCount = Object.entries(oauthState).filter(
    ([k, v]) => v && k !== 'email'
  ).length
  const isLastMethod = (id: string) => !!oauthState[id] && enabledMethodCount === 1

  const save = async (patch: Record<string, boolean | undefined>) => {
    setSaving(true)
    try {
      await updatePortalConfigFn({ data: { oauth: patch } })
      startTransition(() => router.invalidate())
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = (id: string, checked: boolean) => {
    setOauthState((prev) => ({ ...prev, [id]: checked }))
    void save({ [id]: checked })
  }

  const [configDialog, setConfigDialog] = useState<{
    credentialType: string
    providerId: string
    providerName: string
    helpUrl?: string
    fields: (typeof AUTH_PROVIDERS)[number]['platformCredentials']
  } | null>(null)

  const openConfigDialog = (provider: (typeof AUTH_PROVIDERS)[number]) => {
    const helpUrl = provider.platformCredentials.find((f) => f.helpUrl)?.helpUrl
    setConfigDialog({
      credentialType: provider.credentialType,
      providerId: provider.id,
      providerName: provider.name,
      helpUrl,
      fields: provider.platformCredentials,
    })
  }

  return (
    <div className="space-y-8">
      {/* Card — Sign-in Methods */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm">
        <div className="px-6 py-4 border-b border-border/50">
          <h2 className="text-base font-semibold">Sign-in methods</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How visitors sign in to your public feedback portal.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <MethodRow
            icon={KeyIcon}
            label="Password"
            description="Sign in with email and password."
            checked={passwordEnabled}
            onCheckedChange={(v) => handleToggle('password', v)}
            disabled={
              saving ||
              isPending ||
              isManaged('portalConfig.oauth.password') ||
              (passwordEnabled && enabledMethodCount === 1)
            }
            badge={isManaged('portalConfig.oauth.password') ? 'Managed' : undefined}
            badgeTooltip={
              isManaged('portalConfig.oauth.password')
                ? 'Managed by your configuration file.'
                : undefined
            }
          />
          <MethodRow
            icon={EnvelopeIcon}
            label="Email magic link"
            description={
              emailConfigured
                ? 'One-click link or 6-digit code by email.'
                : 'Configure SMTP or Resend to enable email delivery.'
            }
            checked={magicLinkEnabled}
            onCheckedChange={(v) => handleToggle('magicLink', v)}
            disabled={
              saving ||
              isPending ||
              !emailConfigured ||
              isManaged('portalConfig.oauth.magicLink') ||
              (magicLinkEnabled && enabledMethodCount === 1)
            }
          />
        </div>
      </div>

      {/* Card — OAuth Providers (portal-side toggles) */}
      <div className="rounded-xl border border-border/50 bg-card shadow-sm">
        <div className="px-6 py-4 border-b border-border/50">
          <h2 className="text-base font-semibold">Social sign-in</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Let visitors sign in with Google, GitHub, and more. Configure each provider once and
            enable it for the Team or Portal.
          </p>
        </div>
        <div className="p-6">
          <OAuthProviderGrid
            enabled={oauthState}
            credentialStatus={credentialStatus}
            isLastMethod={isLastMethod}
            isManaged={(id) => isManaged(`portalConfig.oauth.${id}`)}
            saving={saving || isPending}
            onToggle={handleToggle}
            onConfigure={openConfigDialog}
            excludeProviderIds={['custom-oidc']}
          />
        </div>
      </div>

      {/* Card — Custom OIDC (own surface; not in the social grid).
          When the workspace has SSO configured, hide the duplicate
          configuration surface and replace it with a banner pointing
          at the unified SSO settings page. Pre-Chunk-1 these two were
          the only way to get a portal-side OIDC button; Chunk 1 wired
          the `sso` provider into both surfaces so this card now
          represents legacy state for tenants that pre-dated SSO. We
          keep it visible (not auto-deleted) for tenants who haven't
          set up SSO yet so they're not stranded mid-migration. */}
      {ssoEnabled ? (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheckIcon className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Single sign-on is your portal IdP</h3>
              <p className="text-sm text-muted-foreground">
                Your workspace already has SSO configured under Single sign-on. The &ldquo;Continue
                with&rdquo; button now appears on the portal sign-in page automatically — no
                separate Custom OIDC configuration needed. Edit your identity provider once on the{' '}
                <a
                  href="/admin/settings/security/sso"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Single sign-on settings page
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      ) : (
        <CustomOidcCard
          configured={!!credentialStatus['custom-oidc']}
          enabled={!!oauthState['custom-oidc']}
          managed={isManaged('portalConfig.oauth.custom-oidc')}
          lastMethod={isLastMethod('custom-oidc')}
          tierEnabled={customOidcProviderTier}
          saving={saving || isPending}
          onToggle={(v) => handleToggle('custom-oidc', v)}
          onConfigure={() => {
            // Look up by provider id (not credentialType — that's what
            // `getAuthProvider(...)` takes). Inline lookup avoids the wrong
            // helper.
            const provider = AUTH_PROVIDERS.find((p) => p.id === 'custom-oidc')
            if (provider) openConfigDialog(provider)
          }}
        />
      )}

      {(saving || isPending) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          <span>Saving…</span>
        </div>
      )}

      {configDialog && (
        <AuthProviderCredentialsDialog
          credentialType={configDialog.credentialType}
          providerId={configDialog.providerId}
          providerName={configDialog.providerName}
          helpUrl={configDialog.helpUrl}
          fields={configDialog.fields}
          open={!!configDialog}
          onOpenChange={(open) => !open && setConfigDialog(null)}
        />
      )}
    </div>
  )
}

interface CustomOidcCardProps {
  configured: boolean
  enabled: boolean
  managed: boolean
  lastMethod: boolean
  tierEnabled: boolean
  saving: boolean
  onToggle: (next: boolean) => void
  onConfigure: () => void
}

/**
 * Dedicated card for custom OIDC. Separated from the alphabetical social
 * grid because bring-your-own-IdP is a different shape of setup than a
 * social tile — there's a discovery URL, a client secret, and tier gating
 * to surface. Industry convention (Linear, Notion, Auth0, Clerk, WorkOS,
 * Stytch) splits Social vs Enterprise SSO into distinct sections.
 *
 * Three states drive the layout, in priority order:
 *  - `!tierEnabled`: tier-locked. Lock badge + upgrade hint; Configure is
 *    disabled, no toggle (nothing to toggle into).
 *  - `!configured`: no credentials yet. Primary "Set up" CTA, no toggle.
 *  - `configured`: outlined Edit button + the enable switch, mirroring
 *    the "configured" half of the social grid tiles.
 */
function CustomOidcCard({
  configured,
  enabled,
  managed,
  lastMethod,
  tierEnabled,
  saving,
  onToggle,
  onConfigure,
}: CustomOidcCardProps) {
  const headerBadge = (() => {
    if (!tierEnabled) {
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          <LockClosedIcon className="mr-1 h-2.5 w-2.5" />
          Higher tier
        </Badge>
      )
    }
    if (!configured) return null
    if (enabled) {
      return (
        <Badge
          variant="outline"
          className="border-green-500/30 text-green-600 text-[10px] px-1.5 py-0"
        >
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-600" />
          Active
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
        Configured
      </Badge>
    )
  })()

  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm">
      <div className="flex items-start gap-4 p-6">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            tierEnabled ? 'bg-violet-600/10' : 'bg-muted'
          )}
        >
          <ShieldCheckIcon
            className={cn('h-5 w-5', tierEnabled ? 'text-violet-600' : 'text-muted-foreground/60')}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Custom identity provider</h2>
            {headerBadge}
          </div>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Let portal users sign in via your own IdP. Works with any OpenID Connect provider —
            Okta, Azure AD, Auth0, Keycloak, and more.
          </p>

          {!tierEnabled ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Available on plans with the custom OIDC feature.
            </p>
          ) : !configured ? (
            <div className="mt-4">
              <Button
                type="button"
                size="sm"
                onClick={onConfigure}
                disabled={managed}
                className="h-9"
              >
                Set up custom OIDC
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onConfigure}
                disabled={managed}
                className="h-9"
              >
                Edit configuration
              </Button>
              {managed && (
                <span className="text-xs text-muted-foreground">
                  Managed by your configuration file.
                </span>
              )}
            </div>
          )}
        </div>
        {tierEnabled && configured && (
          <div className="shrink-0">
            <Switch
              id="custom-oidc-toggle"
              checked={enabled}
              onCheckedChange={onToggle}
              disabled={saving || managed || lastMethod}
              aria-label="Enable custom OIDC for the portal"
            />
          </div>
        )}
      </div>
    </div>
  )
}
