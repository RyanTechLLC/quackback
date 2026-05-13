/**
 * Board view authorization.
 *
 * Pair every canViewBoard() with a matching boardViewFilter() so list
 * queries and single-row reads use the same predicate.
 */
import { sql, type SQL } from 'drizzle-orm'
import { boards, type BoardAudience } from '@/lib/server/db'
import { allowDecision, denyDecision, isTeamActor, type Actor, type Decision } from './types'

const isTeam = isTeamActor

/** Single-row board read authorization. */
export function canViewBoard(actor: Actor, board: { audience: BoardAudience }): Decision {
  if (isTeam(actor)) return allowDecision()
  switch (board.audience.kind) {
    case 'public':
      return allowDecision()
    case 'authenticated':
      return actor.principalType === 'user'
        ? allowDecision()
        : denyDecision('Sign in to view this board')
    case 'team':
      return denyDecision('This board is internal')
    case 'segments':
      return board.audience.segmentIds.some((id) => actor.segmentIds.has(id as never))
        ? allowDecision()
        : denyDecision('This board is restricted')
  }
}

/**
 * SQL predicate for board list queries. The row-by-row truthiness must
 * match canViewBoard exactly — invariant test enforces this.
 */
export function boardViewFilter(actor: Actor): SQL {
  if (isTeam(actor)) {
    return sql`true`
  }
  const memberIds = Array.from(actor.segmentIds) as string[]
  const isUser = actor.principalType === 'user'
  return sql`
    (
      ${boards.audience}->>'kind' = 'public'
      OR (${boards.audience}->>'kind' = 'authenticated' AND ${isUser})
      OR (
        ${boards.audience}->>'kind' = 'segments'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${boards.audience}->'segmentIds') seg
          WHERE seg = ANY(${memberIds}::text[])
        )
      )
    )
  `
}
