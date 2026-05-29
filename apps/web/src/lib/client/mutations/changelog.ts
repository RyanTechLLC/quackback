/**
 * Changelog Mutations
 *
 * Mutation hooks for changelog CRUD operations.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ChangelogId, ChangelogBoardId } from '@quackback/ids'
import {
  createChangelogFn,
  updateChangelogFn,
  deleteChangelogFn,
  createChangelogBoardFn,
  updateChangelogBoardFn,
  deleteChangelogBoardFn,
} from '@/lib/server/functions/changelog'
import { changelogKeys } from '@/lib/client/queries/changelog'
import type { CreateChangelogInput, UpdateChangelogInput } from '@/lib/shared/schemas/changelog'

/**
 * Create a new changelog entry
 */
export function useCreateChangelog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateChangelogInput) => createChangelogFn({ data: input }),
    onSuccess: () => {
      // Invalidate all changelog lists to refetch with new entry
      queryClient.invalidateQueries({ queryKey: changelogKeys.lists() })
      // Also invalidate public lists in case it was published
      queryClient.invalidateQueries({ queryKey: changelogKeys.public() })
    },
  })
}

/**
 * Update an existing changelog entry
 */
export function useUpdateChangelog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateChangelogInput) => updateChangelogFn({ data: input }),
    onSuccess: (data) => {
      const id = data.id as ChangelogId
      // Update the detail cache with new data
      queryClient.setQueryData(changelogKeys.detail(id), data)
      // Invalidate lists in case status or title changed
      queryClient.invalidateQueries({ queryKey: changelogKeys.lists() })
      // Also invalidate public lists in case publish state changed
      queryClient.invalidateQueries({ queryKey: changelogKeys.public() })
    },
  })
}

/**
 * Delete a changelog entry
 */
export function useDeleteChangelog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: ChangelogId) => deleteChangelogFn({ data: { id } }),
    onSuccess: (_data, id) => {
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: changelogKeys.detail(id) })
      // Invalidate lists to remove the deleted entry
      queryClient.invalidateQueries({ queryKey: changelogKeys.lists() })
      // Also invalidate public lists
      queryClient.invalidateQueries({ queryKey: changelogKeys.public() })
    },
  })
}

// ============================================================================
// Changelog board mutations
// ============================================================================

interface CreateChangelogBoardArgs {
  name: string
  slug: string
  description?: string
  isPublic?: boolean
}

interface UpdateChangelogBoardArgs {
  id: ChangelogBoardId
  name?: string
  description?: string | null
  isPublic?: boolean
}

/**
 * Create a new changelog board
 */
export function useCreateChangelogBoard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateChangelogBoardArgs) => createChangelogBoardFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: changelogKeys.boards() })
    },
  })
}

/**
 * Update a changelog board
 */
export function useUpdateChangelogBoard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateChangelogBoardArgs) =>
      updateChangelogBoardFn({ data: { id, ...input } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: changelogKeys.boards() })
      // Board name/visibility can affect list rendering + public feed
      queryClient.invalidateQueries({ queryKey: changelogKeys.lists() })
      queryClient.invalidateQueries({ queryKey: changelogKeys.public() })
    },
  })
}

/**
 * Delete a changelog board
 */
export function useDeleteChangelogBoard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: ChangelogBoardId) => deleteChangelogBoardFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: changelogKeys.boards() })
      queryClient.invalidateQueries({ queryKey: changelogKeys.lists() })
      queryClient.invalidateQueries({ queryKey: changelogKeys.public() })
    },
  })
}
