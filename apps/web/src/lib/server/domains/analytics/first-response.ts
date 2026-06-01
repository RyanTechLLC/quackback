/**
 * Pure first-response-time aggregation for the support analytics panel. Given
 * each conversation's first visitor message and first agent reply (null = not
 * yet answered), compute the median response time, how many are still awaiting,
 * and the share answered within a configurable target. Kept separate from the
 * SQL so the math is unit-tested directly.
 */

export interface FirstResponsePair {
  firstVisitorAt: string | Date
  /** First agent reply, or null when the conversation is still awaiting one. */
  firstAgentAt: string | Date | null
}

export interface FirstResponseSummary {
  respondedCount: number
  awaitingCount: number
  /** Median seconds to first response; null when nothing has been answered. */
  medianSeconds: number | null
  /** Share answered within the target; null with no target or no responses. */
  withinTargetPct: number | null
}

const ms = (v: string | Date) => (v instanceof Date ? v.getTime() : Date.parse(v))

export function summarizeFirstResponse(
  pairs: FirstResponsePair[],
  targetMinutes?: number
): FirstResponseSummary {
  const seconds: number[] = []
  let awaitingCount = 0

  for (const p of pairs) {
    if (p.firstAgentAt == null) {
      awaitingCount++
      continue
    }
    // Clamp a (rare) agent-before-visitor timestamp anomaly to 0.
    seconds.push(Math.max(0, Math.round((ms(p.firstAgentAt) - ms(p.firstVisitorAt)) / 1000)))
  }

  const respondedCount = seconds.length
  if (respondedCount === 0) {
    return { respondedCount: 0, awaitingCount, medianSeconds: null, withinTargetPct: null }
  }

  const sorted = [...seconds].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const medianSeconds =
    sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]

  let withinTargetPct: number | null = null
  if (targetMinutes && targetMinutes > 0) {
    const targetSeconds = targetMinutes * 60
    const within = seconds.filter((s) => s <= targetSeconds).length
    withinTargetPct = Math.round((within / respondedCount) * 100)
  }

  return { respondedCount, awaitingCount, medianSeconds, withinTargetPct }
}
