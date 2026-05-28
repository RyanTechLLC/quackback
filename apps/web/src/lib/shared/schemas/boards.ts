import { z } from 'zod'
import { ACCESS_TIERS, ACCESS_TIER_RANK } from '@/lib/shared/db-types'

export const createBoardSchema = z.object({
  name: z.string().min(1, 'Board name is required').max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(true),
})

export const updateBoardSchema = z.object({
  name: z.string().min(1, 'Board name is required').max(100),
  description: z.string().max(500).optional(),
})

export const deleteBoardSchema = z.object({
  confirmName: z.string(),
})

export type CreateBoardInput = z.input<typeof createBoardSchema>
export type CreateBoardOutput = z.infer<typeof createBoardSchema>
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>
export type DeleteBoardInput = z.infer<typeof deleteBoardSchema>

// ============================================
// Board access (view/comment/submit + segments + approval)
// ============================================
//
// Kept alongside the other board schemas (and out of `server/`) so client
// code can import without dragging the @quackback/db/client guard. Only
// imports zod + @quackback/db/types — both are runtime-safe in any env.

const tierSchema = z.enum(ACCESS_TIERS)

/**
 * Validation for the per-action `BoardAccess` payload
 * (view/vote/comment/submit + per-action segments + approval). Enforces
 * the spec's tier-rank invariants so a board can't accidentally land in
 * a contradictory state (e.g. anonymous voting on a team-only-visible
 * board).
 *
 * Invariants:
 *  - `vote.rank >= view.rank` (can't be more permissive than view)
 *  - `comment.rank >= view.rank`
 *  - `submit.rank >= view.rank`
 *  - For each action, if its tier is `'segments'`, the matching
 *    `segments[action]` array must be non-empty (an empty allowlist
 *    would hide the board from everyone in that tier)
 *  - `segments[action].length <= 50` per action (board capacity cap)
 */
export const boardAccessSchema = z
  .object({
    view: tierSchema,
    vote: tierSchema,
    comment: tierSchema,
    submit: tierSchema,
    segments: z.object({
      view: z.array(z.string()).max(50, 'At most 50 segments per board.'),
      vote: z.array(z.string()).max(50, 'At most 50 segments per board.'),
      comment: z.array(z.string()).max(50, 'At most 50 segments per board.'),
      submit: z.array(z.string()).max(50, 'At most 50 segments per board.'),
    }),
    approval: z.object({
      posts: z.boolean(),
      comments: z.boolean(),
    }),
  })
  .superRefine((val, ctx) => {
    if (ACCESS_TIER_RANK[val.vote] < ACCESS_TIER_RANK[val.view]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vote'],
        message: 'Vote tier cannot be more permissive than view.',
      })
    }
    if (ACCESS_TIER_RANK[val.comment] < ACCESS_TIER_RANK[val.view]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'Comment tier cannot be more permissive than view.',
      })
    }
    if (ACCESS_TIER_RANK[val.submit] < ACCESS_TIER_RANK[val.view]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['submit'],
        message: 'Submit tier cannot be more permissive than view.',
      })
    }
    // Per-action segments-non-empty when that action is set to 'segments'.
    for (const action of ['view', 'vote', 'comment', 'submit'] as const) {
      if (val[action] === 'segments' && val.segments[action].length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['segments', action],
          message: `Pick at least one segment for ${action} — empty allowlist hides the board.`,
        })
      }
    }
  })
