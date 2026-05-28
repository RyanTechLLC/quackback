import { describe, it, expect } from 'vitest'
import { boardAccessSchema } from '../boards'

const baseValid = {
  view: 'anonymous' as const,
  vote: 'anonymous' as const,
  comment: 'anonymous' as const,
  submit: 'anonymous' as const,
  segments: { view: [], vote: [], comment: [], submit: [] },
  approval: { posts: false, comments: false },
}

describe('boardAccessSchema — valid shapes', () => {
  it('accepts the default-equivalent shape', () => {
    expect(() => boardAccessSchema.parse(baseValid)).not.toThrow()
  })

  it('accepts comment tier above view tier', () => {
    expect(() =>
      boardAccessSchema.parse({ ...baseValid, view: 'anonymous', comment: 'authenticated' })
    ).not.toThrow()
  })

  it('accepts submit tier above view tier (admin-curated)', () => {
    expect(() =>
      boardAccessSchema.parse({ ...baseValid, view: 'anonymous', submit: 'team' })
    ).not.toThrow()
  })

  it('accepts segments tier with non-empty per-action segments', () => {
    expect(() =>
      boardAccessSchema.parse({
        ...baseValid,
        view: 'segments',
        vote: 'segments',
        comment: 'segments',
        submit: 'segments',
        segments: { view: ['seg_a'], vote: ['seg_a'], comment: ['seg_a'], submit: ['seg_a'] },
      })
    ).not.toThrow()
  })

  it('accepts segments tier on just comment/submit (view stays anonymous, only those lists required)', () => {
    expect(() =>
      boardAccessSchema.parse({
        ...baseValid,
        view: 'anonymous',
        vote: 'anonymous',
        comment: 'segments',
        submit: 'segments',
        segments: { view: [], vote: [], comment: ['seg_a'], submit: ['seg_a'] },
      })
    ).not.toThrow()
  })

  it('accepts mixed per-action segment lists (view picks pro; submit picks beta)', () => {
    expect(() =>
      boardAccessSchema.parse({
        ...baseValid,
        view: 'segments',
        vote: 'segments',
        comment: 'segments',
        submit: 'segments',
        segments: {
          view: ['seg_pro'],
          vote: ['seg_pro'],
          comment: ['seg_pro'],
          submit: ['seg_beta'],
        },
      })
    ).not.toThrow()
  })
})

describe('boardAccessSchema — tier rank invariants', () => {
  it('rejects comment tier below view tier (would let users comment on invisible boards)', () => {
    expect(() =>
      boardAccessSchema.parse({ ...baseValid, view: 'authenticated', comment: 'anonymous' })
    ).toThrow(/comment/i)
  })

  it('rejects submit tier below view tier', () => {
    expect(() =>
      boardAccessSchema.parse({ ...baseValid, view: 'authenticated', submit: 'anonymous' })
    ).toThrow(/submit/i)
  })

  it('rejects view=segments comment=anonymous (rank inversion)', () => {
    expect(() =>
      boardAccessSchema.parse({
        ...baseValid,
        view: 'segments',
        vote: 'segments',
        comment: 'anonymous',
        submit: 'segments',
        segments: { view: ['seg_a'], vote: ['seg_a'], comment: [], submit: ['seg_a'] },
      })
    ).toThrow(/comment/i)
  })
})

describe('boardAccessSchema — segments invariant', () => {
  it('rejects segments tier with all per-action lists empty', () => {
    expect(() =>
      boardAccessSchema.parse({
        ...baseValid,
        view: 'segments',
        vote: 'segments',
        comment: 'segments',
        submit: 'segments',
        segments: { view: [], vote: [], comment: [], submit: [] },
      })
    ).toThrow(/segment/i)
  })

  it('rejects when only one of the three tiers is segments and that action list is empty', () => {
    expect(() =>
      boardAccessSchema.parse({
        ...baseValid,
        view: 'anonymous',
        vote: 'anonymous',
        comment: 'anonymous',
        submit: 'segments',
        segments: { view: [], vote: [], comment: [], submit: [] },
      })
    ).toThrow(/segment/i)
  })

  it('rejects when comment is segments and only comment list is empty (per-action enforcement)', () => {
    expect(() =>
      boardAccessSchema.parse({
        ...baseValid,
        view: 'segments',
        vote: 'segments',
        comment: 'segments',
        submit: 'segments',
        segments: { view: ['seg_a'], vote: ['seg_a'], comment: [], submit: ['seg_a'] },
      })
    ).toThrow(/segment/i)
  })

  it('caps each per-action segment list at 50', () => {
    const fifty1 = Array.from({ length: 51 }, (_, i) => `seg_${i}`)
    expect(() =>
      boardAccessSchema.parse({
        ...baseValid,
        view: 'segments',
        vote: 'segments',
        comment: 'segments',
        submit: 'segments',
        segments: { view: fifty1, vote: ['seg_a'], comment: ['seg_a'], submit: ['seg_a'] },
      })
    ).toThrow(/50/)
  })
})

describe('boardAccessSchema — vote action invariants', () => {
  it('rejects vote tier below view tier (would let denied viewers vote)', () => {
    expect(() =>
      boardAccessSchema.parse({
        ...baseValid,
        view: 'authenticated',
        vote: 'anonymous',
      })
    ).toThrow(/vote/i)
  })

  it('accepts vote tier stricter than view tier (modern "Public": view=anonymous, vote=authenticated)', () => {
    expect(() =>
      boardAccessSchema.parse({
        ...baseValid,
        view: 'anonymous',
        vote: 'authenticated',
      })
    ).not.toThrow()
  })

  it('rejects when vote is segments and the vote list is empty', () => {
    expect(() =>
      boardAccessSchema.parse({
        ...baseValid,
        view: 'segments',
        vote: 'segments',
        comment: 'segments',
        submit: 'segments',
        segments: { view: ['seg_a'], vote: [], comment: ['seg_a'], submit: ['seg_a'] },
      })
    ).toThrow(/vote/i)
  })
})

describe('boardAccessSchema — tier enum invariants', () => {
  it('rejects unknown tier name', () => {
    expect(() => boardAccessSchema.parse({ ...baseValid, view: 'admin' as never })).toThrow()
  })
})
