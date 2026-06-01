import { describe, it, expect } from 'vitest'
import { summarizeFirstResponse } from '../first-response'

describe('summarizeFirstResponse', () => {
  it('returns nulls/zeros when there are no conversations', () => {
    expect(summarizeFirstResponse([])).toEqual({
      respondedCount: 0,
      awaitingCount: 0,
      medianSeconds: null,
      withinTargetPct: null,
    })
  })

  it('counts awaiting (no agent reply yet) separately from responded', () => {
    const s = summarizeFirstResponse([
      { firstVisitorAt: '2026-05-01T10:00:00Z', firstAgentAt: '2026-05-01T10:05:00Z' },
      { firstVisitorAt: '2026-05-01T11:00:00Z', firstAgentAt: null },
    ])
    expect(s.respondedCount).toBe(1)
    expect(s.awaitingCount).toBe(1)
    expect(s.medianSeconds).toBe(300)
  })

  it('takes the median of an even set as the mean of the two middle values', () => {
    const base = '2026-05-01T10:00:00Z'
    const after = (sec: number) => new Date(Date.parse(base) + sec * 1000).toISOString()
    const s = summarizeFirstResponse([
      { firstVisitorAt: base, firstAgentAt: after(60) }, // 60s
      { firstVisitorAt: base, firstAgentAt: after(120) }, // 120s
      { firstVisitorAt: base, firstAgentAt: after(180) }, // 180s
      { firstVisitorAt: base, firstAgentAt: after(300) }, // 300s
    ])
    expect(s.medianSeconds).toBe(150) // (120 + 180) / 2
  })

  it('computes the percentage answered within the target', () => {
    const base = '2026-05-01T10:00:00Z'
    const after = (min: number) => new Date(Date.parse(base) + min * 60_000).toISOString()
    const s = summarizeFirstResponse(
      [
        { firstVisitorAt: base, firstAgentAt: after(10) }, // within 30m
        { firstVisitorAt: base, firstAgentAt: after(20) }, // within 30m
        { firstVisitorAt: base, firstAgentAt: after(90) }, // over 30m
        { firstVisitorAt: base, firstAgentAt: null }, // awaiting (excluded)
      ],
      30
    )
    expect(s.withinTargetPct).toBe(67) // 2 of 3 responded within target
  })

  it('clamps an agent-before-visitor anomaly to 0 rather than going negative', () => {
    const s = summarizeFirstResponse([
      { firstVisitorAt: '2026-05-01T10:05:00Z', firstAgentAt: '2026-05-01T10:00:00Z' },
    ])
    expect(s.respondedCount).toBe(1)
    expect(s.medianSeconds).toBe(0)
  })
})
