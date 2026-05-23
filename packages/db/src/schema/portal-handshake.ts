/**
 * Portal handshake — one-time token redemption tracking.
 *
 * When a widget-HMAC-verified user clicks "Go to portal," the widget
 * bootstrap hands them a short-lived signed handshake URL. The
 * /portal-handshake route validates the token and creates a portal
 * cookie session for the identified user.
 *
 * To enforce one-time-use, every successfully consumed jti is
 * inserted here. A replayed token is rejected as soon as its jti is
 * found in this table. The (jti) primary key makes the insert
 * uniqueness check a single index hit, and expires_at allows a
 * future cleanup job to prune rows older than the token TTL.
 */
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'

export const portalHandshakeUsed = pgTable(
  'portal_handshake_used',
  {
    /** The JWT token id — also the primary key (unique per token). */
    jti: text('jti').primaryKey(),
    /** UTC timestamp when the token was consumed (route accepted it). */
    consumedAt: timestamp('consumed_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * UTC timestamp when the original token expires.
     * Stored so a cleanup job can DELETE WHERE expires_at < now()
     * without decoding the token again.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // Drives the cleanup query: DELETE WHERE expires_at < now()
    index('portal_handshake_used_expires_at_idx').on(table.expiresAt),
  ]
)
