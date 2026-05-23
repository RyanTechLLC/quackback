/**
 * Portal handshake route.
 *
 * Flat route — intentionally NOT under _portal so the portal access gate
 * does not fire before the session has been created. Path: /portal-handshake
 *
 * Flow:
 *   1. Widget bootstrap includes a signed handshake URL (token in `t` param).
 *   2. User clicks "Go to portal" in the widget — browser navigates here.
 *   3. Loader validates the token (signature, expiry, one-time use).
 *      - Invalid / expired / replayed → render an error page with a friendly message.
 *   4. Valid token → create a portal cookie session for the identified user.
 *   5. Redirect to `returnTo` (safe-origin-validated) or `/`.
 *
 * No JavaScript required — the redirect and cookie are set server-side.
 */
import { createFileRoute, redirect } from '@tanstack/react-router'
import { setResponseHeader } from '@tanstack/react-start/server'
import { verifyPortalHandshakeToken } from '@/lib/server/auth/portal-handshake'
import { getWidgetSecret } from '@/lib/server/domains/settings/settings.widget'
import { isSafeCallbackUrl } from '@/lib/shared/routing'
import { recordAuditEvent } from '@/lib/server/audit/log'

// =============================================================================
// Loader
// =============================================================================

type LoaderData =
  | { ok: true }
  | { ok: false; error: 'expired' | 'invalid' | 'used' | 'no_token' | 'server_error' }

export const Route = createFileRoute('/portal-handshake')({
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search.t === 'string' ? search.t : undefined,
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
  }),
  loader: async ({ location }): Promise<LoaderData> => {
    const search = location.search as { t?: string; returnTo?: string }
    const token = search.t

    if (!token) {
      return { ok: false, error: 'no_token' }
    }

    // Fetch the widget secret for signature verification.
    let secret: string | null
    try {
      secret = await getWidgetSecret()
    } catch {
      console.error('[route:portal-handshake] failed to load widget secret')
      return { ok: false, error: 'server_error' }
    }

    if (!secret) {
      console.error('[route:portal-handshake] widget secret not configured')
      return { ok: false, error: 'server_error' }
    }

    // Verify signature, expiry, and one-time use.
    const result = await verifyPortalHandshakeToken(token, secret)

    if (!result.ok) {
      console.warn(`[route:portal-handshake] token rejected: ${result.error}`)
      // Best-effort audit log for invalid/expired/used attempts.
      recordAuditEvent({
        event: 'portal.widget_handshake.invalid',
        outcome: 'failure',
        actor: {},
        metadata: { reason: result.error },
      }).catch(() => {})
      return { ok: false, error: result.error }
    }

    const { userId } = result.payload

    // Create a portal cookie session for the identified user.
    // We write the session row directly and sign the cookie ourselves —
    // the same technique the widget identify endpoint uses but we also
    // set the cookie so the portal's cookie-based auth picks it up.
    try {
      const { db, session } = await import('@/lib/server/db')
      const { config } = await import('@/lib/server/config')
      const { getRequestHeaders } = await import('@tanstack/react-start/server')
      const requestHeaders = getRequestHeaders()

      // Find an existing non-expired session or create a new one.
      const { and, eq, gt } = await import('@/lib/server/db')

      const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

      const existingSession = await db.query.session.findFirst({
        where: and(eq(session.userId, userId), gt(session.expiresAt, new Date())),
      })

      let sessionToken: string
      if (existingSession) {
        await db
          .update(session)
          .set({ updatedAt: new Date() })
          .where(eq(session.id, existingSession.id))
        sessionToken = existingSession.token
      } else {
        sessionToken = crypto.randomUUID()
        const now = new Date()
        await db.insert(session).values({
          id: crypto.randomUUID(),
          token: sessionToken,
          userId,
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
          createdAt: now,
          updatedAt: now,
          ipAddress: requestHeaders.get('x-forwarded-for') ?? null,
          userAgent: requestHeaders.get('user-agent') ?? null,
        })
      }

      // Sign the session token the same way better-auth does it:
      //   encodeURIComponent(token + "." + base64(HMAC-SHA256(token, secret)))
      const secretKey = config.secretKey
      const signature = await crypto.subtle.sign(
        'HMAC',
        await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(secretKey),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        ),
        new TextEncoder().encode(sessionToken)
      )
      const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      const signedValue = encodeURIComponent(`${sessionToken}.${sigBase64}`)

      // Cookie name: "better-auth.session_token" (no __Secure- prefix on
      // HTTP; the defaultCookieAttributes in auth/index.ts adds it on HTTPS).
      const isSecure = (config.baseUrl ?? '').startsWith('https://')
      const cookieName = isSecure
        ? '__Secure-better-auth.session_token'
        : 'better-auth.session_token'
      const maxAge = 7 * 24 * 60 * 60 // 7 days in seconds

      let cookieHeader = `${cookieName}=${signedValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
      if (isSecure) cookieHeader += '; Secure'

      setResponseHeader('Set-Cookie', cookieHeader)

      // Best-effort audit log.
      recordAuditEvent({
        event: 'portal.widget_handshake.consumed',
        outcome: 'success',
        actor: { userId },
        target: { type: 'user', id: userId },
      }).catch(() => {})
    } catch (err) {
      console.error('[route:portal-handshake] session creation failed:', err)
      return { ok: false, error: 'server_error' }
    }

    // Redirect to the portal. `returnTo` is validated for same-origin safety.
    const dest = isSafeCallbackUrl(search.returnTo) ? search.returnTo : '/'
    throw redirect({ to: dest })
  },
  component: PortalHandshakeErrorPage,
})

// =============================================================================
// Error page (only rendered on failure — success is always a redirect)
// =============================================================================

function PortalHandshakeErrorPage() {
  const data = Route.useLoaderData() as LoaderData

  if (data.ok) {
    // Should not happen — the loader redirects on success — but satisfy TS.
    return null
  }

  const message = getErrorMessage(data.error)

  return (
    <PageShell>
      <Card>
        <h1 className="text-xl font-semibold tracking-tight">{message.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message.body}</p>
        <a
          href="/"
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline underline-offset-4"
        >
          Go to portal
        </a>
      </Card>
    </PageShell>
  )
}

type ErrorCode = Extract<LoaderData, { ok: false }>['error']

function getErrorMessage(error: ErrorCode): {
  title: string
  body: string
} {
  switch (error) {
    case 'expired':
      return {
        title: 'Sign-in link expired',
        body: 'This sign-in link has expired or already been used. Please reopen the widget to try again.',
      }
    case 'used':
      return {
        title: 'Sign-in link already used',
        body: 'This sign-in link has already been used. Please reopen the widget to get a fresh link.',
      }
    case 'server_error':
      return {
        title: 'Something went wrong',
        body: 'We could not complete your sign-in at this time. Please try again in a moment.',
      }
    case 'no_token':
    case 'invalid':
    default:
      return {
        title: 'Invalid sign-in link',
        body: 'This sign-in link is invalid. Please reopen the widget and try again.',
      }
  }
}

// =============================================================================
// Layout helpers — match the portal-invite route style
// =============================================================================

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.07]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 25% 15%, var(--primary), transparent),
            radial-gradient(ellipse 50% 80% at 80% 85%, var(--primary), transparent)
          `,
        }}
      />
      <div className="relative w-full max-w-md py-12">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/logo.png" alt="" className="h-6 w-6 rounded" />
          <span className="text-sm font-medium text-muted-foreground">Quackback</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/80 p-8 text-center backdrop-blur-sm"
      style={{
        boxShadow:
          '0 0 80px -20px oklch(0.886 0.176 86 / 0.12), 0 20px 40px -12px rgb(0 0 0 / 0.08)',
      }}
    >
      {children}
    </div>
  )
}
