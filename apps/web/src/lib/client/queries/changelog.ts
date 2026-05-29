/**
 * Changelog Queries
 *
 * Query key factories and query options for changelog data.
 */

import { queryOptions, infiniteQueryOptions } from '@tanstack/react-query'
import type { ChangelogId } from '@quackback/ids'
import {
  listChangelogsFn,
  getChangelogFn,
  listChangelogBoardsFn,
  listPublicChangelogsFn,
  listPublicChangelogBoardsFn,
  getPublicChangelogFn,
} from '@/lib/server/functions/changelog'

const STALE_TIME_SHORT = 30 * 1000
const STALE_TIME_MEDIUM = 60 * 1000

/**
 * Query key factory for changelogs
 */
export const changelogKeys = {
  all: ['changelogs'] as const,
  boards: () => [...changelogKeys.all, 'boards'] as const,
  lists: () => [...changelogKeys.all, 'list'] as const,
  list: (filters: { status?: string; boardId?: string }) =>
    [...changelogKeys.lists(), filters] as const,
  details: () => [...changelogKeys.all, 'detail'] as const,
  detail: (id: ChangelogId) => [...changelogKeys.details(), id] as const,
  public: () => [...changelogKeys.all, 'public'] as const,
  publicBoards: () => [...changelogKeys.public(), 'boards'] as const,
  publicList: (filters: { boardId?: string } = {}) =>
    [...changelogKeys.public(), 'list', filters] as const,
  publicDetail: (id: ChangelogId) => [...changelogKeys.public(), 'detail', id] as const,
}

/**
 * Admin changelog queries
 */
export const changelogQueries = {
  list: (params: { status?: 'draft' | 'scheduled' | 'published' | 'all'; boardId?: string }) =>
    infiniteQueryOptions({
      queryKey: changelogKeys.list(params),
      queryFn: ({ pageParam }) =>
        listChangelogsFn({
          data: {
            status: params.status,
            boardId: params.boardId,
            cursor: pageParam,
            limit: 20,
          },
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: STALE_TIME_SHORT,
    }),

  detail: (id: ChangelogId) =>
    queryOptions({
      queryKey: changelogKeys.detail(id),
      queryFn: () => getChangelogFn({ data: { id } }),
      staleTime: STALE_TIME_MEDIUM,
    }),

  boards: () =>
    queryOptions({
      queryKey: changelogKeys.boards(),
      queryFn: () => listChangelogBoardsFn(),
      staleTime: STALE_TIME_MEDIUM,
    }),
}

/**
 * Public changelog queries
 */
export const publicChangelogQueries = {
  list: (params: { boardId?: string } = {}) =>
    infiniteQueryOptions({
      queryKey: changelogKeys.publicList(params),
      queryFn: ({ pageParam }) =>
        listPublicChangelogsFn({
          data: {
            boardId: params.boardId,
            cursor: pageParam,
            limit: 10,
          },
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      staleTime: STALE_TIME_MEDIUM,
    }),

  /** Boards visible to the current portal viewer (public + private-if-team). */
  boards: () =>
    queryOptions({
      queryKey: changelogKeys.publicBoards(),
      queryFn: () => listPublicChangelogBoardsFn(),
      staleTime: STALE_TIME_MEDIUM,
    }),

  detail: (id: ChangelogId) =>
    queryOptions({
      queryKey: changelogKeys.publicDetail(id),
      queryFn: () => getPublicChangelogFn({ data: { id } }),
      staleTime: STALE_TIME_MEDIUM,
    }),
}
