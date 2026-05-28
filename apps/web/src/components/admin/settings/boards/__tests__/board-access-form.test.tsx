// @vitest-environment happy-dom
/**
 * <BoardAccessForm> — permissions matrix.
 *
 * Covers:
 *   - Preset detection from incoming board.access shape
 *   - Selecting a preset hides the matrix; Custom reveals it
 *   - Tier cells in the matrix are role=button; selecting a cell flips
 *     the form to Custom mode
 *   - Tier hierarchy: raising View auto-clamps Comment/Submit
 *   - Save is disabled when any action picks 'segments' but the list is empty
 *   - Save payload uses the per-action `segments` shape
 *
 * The mutation hook, segments query, and portalConfig query are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BoardAccessForm } from '../board-access-form'
import { DEFAULT_BOARD_ACCESS, type BoardAccess } from '@/lib/shared/db-types'
import type { BoardId } from '@quackback/ids'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))

const mutate = vi.fn()
vi.mock('@/lib/client/mutations', () => ({
  useUpdateBoardAccess: () => ({
    mutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}))

vi.mock('@/lib/client/hooks/use-segments-queries', () => ({
  useSegments: () => ({
    data: [
      { id: 'seg_alpha', name: 'Alpha', memberCount: 3, description: 'Alpha description' },
      { id: 'seg_beta', name: 'Beta', memberCount: 0, description: null },
    ],
    isLoading: false,
    isError: false,
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOARD_ID = 'brd_test' as BoardId

function renderForm(access: BoardAccess = DEFAULT_BOARD_ACCESS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BoardAccessForm board={{ id: BOARD_ID, access }} />
    </QueryClientProvider>
  )
}

/** Click a tier cell in the matrix by action label + tier label. */
function clickTierCell(actionLabel: string, tierLabel: string) {
  const btn = screen.getByRole('button', { name: `${actionLabel}: ${tierLabel}` })
  fireEvent.click(btn)
  return btn
}

/** True iff the named matrix cell button is currently selected. */
function isCellSelected(actionLabel: string, tierLabel: string) {
  const btn = screen.getByRole('button', { name: `${actionLabel}: ${tierLabel}` })
  return btn.getAttribute('aria-pressed') === 'true'
}

beforeEach(() => {
  mutate.mockReset()
})

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

describe('<BoardAccessForm> presets', () => {
  it('detects Public when board.access is all-anonymous with clean segments', () => {
    renderForm()
    // Matrix is hidden when preset !== 'custom'; check by absence of cell.
    expect(screen.queryByRole('button', { name: /^View & vote:/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Public' })).toBeInTheDocument()
  })

  it('detects Custom when access has any divergence', () => {
    renderForm({
      view: 'anonymous',
      vote: 'anonymous',
      comment: 'authenticated',
      submit: 'authenticated',
      segments: { view: [], vote: [], comment: [], submit: [] },
      approval: { posts: false, comments: false },
    })
    // Matrix is visible (in Custom mode)
    expect(screen.getByRole('button', { name: 'View & vote: Anyone' })).toBeInTheDocument()
  })

  it('clicking Custom card reveals the matrix', () => {
    renderForm()
    expect(screen.queryByRole('button', { name: /^View & vote:/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByRole('button', { name: 'View & vote: Anyone' })).toBeInTheDocument()
  })

  it('clicking a non-Custom preset hides the matrix again', () => {
    renderForm({
      view: 'anonymous',
      vote: 'anonymous',
      comment: 'authenticated',
      submit: 'authenticated',
      segments: { view: [], vote: [], comment: [], submit: [] },
      approval: { posts: false, comments: false },
    })
    expect(screen.getByRole('button', { name: 'View & vote: Anyone' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Team only' }))
    expect(screen.queryByRole('button', { name: /^View & vote:/ })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Matrix tier selection
// ---------------------------------------------------------------------------

describe('<BoardAccessForm> matrix', () => {
  function renderInCustom(access?: BoardAccess) {
    renderForm(
      access ?? {
        view: 'anonymous',
        vote: 'anonymous',
        comment: 'authenticated',
        submit: 'authenticated',
        segments: { view: [], vote: [], comment: [], submit: [] },
        approval: { posts: false, comments: false },
      }
    )
  }

  it('selecting a tier cell sets aria-pressed=true on that cell only', () => {
    renderInCustom()
    clickTierCell('Comment', 'Anyone')
    expect(isCellSelected('Comment', 'Anyone')).toBe(true)
    expect(isCellSelected('Comment', 'Signed-in')).toBe(false)
  })

  it('disables Comment/Submit cells with rank below View', () => {
    renderInCustom({
      view: 'team',
      vote: 'team',
      comment: 'team',
      submit: 'team',
      segments: { view: [], vote: [], comment: [], submit: [] },
      approval: { posts: false, comments: false },
    })
    // We're in Custom mode now via the divergence — actually team-all matches
    // no Custom by default. Force Custom by clicking the Custom card after a
    // preset is auto-detected.
    // For team-all, preset = "Team only" (matches the Team preset), so the
    // matrix is hidden. Click Custom to reveal it.
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    const anyoneOnComment = screen.getByRole('button', { name: 'Comment: Anyone' })
    expect(anyoneOnComment).toBeDisabled()
    const anyoneOnSubmit = screen.getByRole('button', { name: 'Submit posts: Anyone' })
    expect(anyoneOnSubmit).toBeDisabled()
  })

  it('raising View tier auto-clamps Comment and Submit to match', () => {
    // All-anonymous matches the Public preset, so the matrix starts hidden.
    // Click Custom to reveal it before clicking cells.
    renderInCustom({
      view: 'anonymous',
      vote: 'anonymous',
      comment: 'anonymous',
      submit: 'anonymous',
      segments: { view: [], vote: [], comment: [], submit: [] },
      approval: { posts: false, comments: false },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    clickTierCell('View & vote', 'Team only')
    expect(isCellSelected('View & vote', 'Team only')).toBe(true)
    expect(isCellSelected('Comment', 'Team only')).toBe(true)
    expect(isCellSelected('Submit posts', 'Team only')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Segments empty-state + save gate
// ---------------------------------------------------------------------------

describe('<BoardAccessForm> save', () => {
  it('Save dock is collapsed until form is dirty', () => {
    renderForm()
    const region = screen.getByRole('region', { name: /save changes/i })
    expect(region.getAttribute('data-dirty')).toBeNull()
  })

  it('Save dock surfaces once the form is dirty', () => {
    renderForm({
      view: 'anonymous',
      vote: 'anonymous',
      comment: 'authenticated',
      submit: 'authenticated',
      segments: { view: [], vote: [], comment: [], submit: [] },
      approval: { posts: false, comments: false },
    })
    // Toggle a cell to dirty the form
    clickTierCell('Comment', 'Team only')
    const region = screen.getByRole('region', { name: /save changes/i })
    expect(region.getAttribute('data-dirty')).toBe('true')
  })

  it('disables Save when any action is on segments tier with empty list', () => {
    renderForm({
      view: 'segments',
      vote: 'segments',
      comment: 'segments',
      submit: 'segments',
      segments: { view: [], vote: [], comment: [], submit: [] },
      approval: { posts: false, comments: false },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    // Make form dirty by re-clicking the same view tier to mark a change
    // (selecting current value still doesn't dirty; instead toggle off-on).
    // Easier: directly verify the button is disabled via its `error` prop —
    // the save dock should render with disabled Save once a change is made.
    // Toggle Comment to a different tier and back to dirty the form.
    clickTierCell('Comment', 'Team only')
    clickTierCell('Comment', 'Segments')
    // Now form is dirty and segments are empty for at least one action.
    const save = screen.getByRole('button', { name: /save changes/i })
    expect(save).toBeDisabled()
  })

  it('submits the BoardAccess payload with the per-action segments shape', async () => {
    renderForm({
      view: 'anonymous',
      vote: 'anonymous',
      comment: 'authenticated',
      submit: 'authenticated',
      segments: { view: [], vote: [], comment: [], submit: [] },
      approval: { posts: true, comments: false },
    })
    // Form starts in Custom mode (divergence). Mark dirty by toggling Comment.
    clickTierCell('Comment', 'Team only')
    clickTierCell('Comment', 'Signed-in')
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        boardId: BOARD_ID,
        access: expect.objectContaining({
          segments: expect.objectContaining({
            view: expect.any(Array),
            comment: expect.any(Array),
            submit: expect.any(Array),
          }),
          approval: { posts: true, comments: false },
        }),
      })
    )
  })

  it('Discard restores the original access', async () => {
    renderForm({
      view: 'anonymous',
      vote: 'anonymous',
      comment: 'authenticated',
      submit: 'authenticated',
      segments: { view: [], vote: [], comment: [], submit: [] },
      approval: { posts: false, comments: false },
    })
    clickTierCell('Comment', 'Team only')
    expect(isCellSelected('Comment', 'Team only')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /discard/i }))
    expect(isCellSelected('Comment', 'Signed-in')).toBe(true)
    expect(isCellSelected('Comment', 'Team only')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Preset segments cleanup
// ---------------------------------------------------------------------------

describe('<BoardAccessForm> preset segments cleanup', () => {
  it('clicking a non-segments preset clears stale segment selections', async () => {
    renderForm({
      view: 'segments',
      vote: 'segments',
      comment: 'segments',
      submit: 'segments',
      segments: {
        view: ['seg_alpha'],
        vote: ['seg_alpha'],
        comment: ['seg_alpha'],
        submit: ['seg_alpha'],
      },
      approval: { posts: false, comments: false },
    })
    // Form is in Custom (no preset matches segments-all with non-empty lists).
    fireEvent.click(screen.getByRole('button', { name: 'Public' }))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          access: expect.objectContaining({
            segments: { view: [], vote: [], comment: [], submit: [] },
          }),
        })
      )
    )
  })
})
