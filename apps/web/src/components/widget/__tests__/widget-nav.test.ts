import { describe, it, expect } from 'vitest'
import { resolveInitialTab, resolveInitialView } from '../widget-nav'

// Phase 0 pins the EXISTING initial-tab/view behavior so the rename of the
// 'home' view -> 'feedback-feed' is provably behaviour-preserving. The feedback
// surface's root view is 'feedback-feed'; every other surface's root view shares
// its tab name. Priority order is feedback > changelog > help > chat.

describe('resolveInitialTab', () => {
  it('picks feedback when feedback is enabled', () => {
    expect(resolveInitialTab({ feedback: true })).toBe('feedback')
  })

  it('falls back to changelog when feedback is off', () => {
    expect(resolveInitialTab({ changelog: true })).toBe('changelog')
  })

  it('falls back to help when only help is on', () => {
    expect(resolveInitialTab({ help: true })).toBe('help')
  })

  it('falls back to chat when only chat is on', () => {
    expect(resolveInitialTab({ chat: true })).toBe('chat')
  })

  it('honours priority feedback > changelog > help > chat', () => {
    expect(resolveInitialTab({ feedback: true, changelog: true, help: true, chat: true })).toBe(
      'feedback'
    )
    expect(resolveInitialTab({ changelog: true, help: true, chat: true })).toBe('changelog')
    expect(resolveInitialTab({ help: true, chat: true })).toBe('help')
  })

  it('defaults to chat for an empty (degenerate) config', () => {
    expect(resolveInitialTab({})).toBe('chat')
  })
})

describe('resolveInitialView', () => {
  it('maps the feedback tab to the feedback-feed view', () => {
    expect(resolveInitialView({ feedback: true })).toBe('feedback-feed')
    expect(resolveInitialView({ feedback: true, changelog: true })).toBe('feedback-feed')
  })

  it('maps a non-feedback initial tab to its same-named root view', () => {
    expect(resolveInitialView({ changelog: true })).toBe('changelog')
    expect(resolveInitialView({ help: true })).toBe('help')
    expect(resolveInitialView({ chat: true })).toBe('chat')
  })
})
