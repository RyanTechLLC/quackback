import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ChangelogEntryCard } from './changelog-entry-card'
import { EmptyState } from '@/components/shared/empty-state'
import { publicChangelogQueries } from '@/lib/client/queries/changelog'
import { cn } from '@/lib/shared/utils'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { LockClosedIcon } from '@heroicons/react/24/solid'

export function ChangelogListPublic() {
  // `null` = "All" (aggregate across every visible board).
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)

  const { data: boardsData } = useQuery(publicChangelogQueries.boards())
  const boards = boardsData?.boards ?? []
  // Only offer switching when there's more than one board to switch between.
  const showSwitcher = boards.length > 1

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery(
    publicChangelogQueries.list({ boardId: selectedBoardId ?? undefined })
  )

  const entries = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div>
      {showSwitcher && (
        <div
          role="tablist"
          aria-label="Changelog boards"
          className="mb-8 flex flex-wrap gap-2 border-b border-border/40 pb-4"
        >
          <BoardTab
            label="All"
            isActive={selectedBoardId === null}
            onClick={() => setSelectedBoardId(null)}
          />
          {boards.map((board) => (
            <BoardTab
              key={board.id}
              label={board.name}
              isPrivate={!board.isPublic}
              isActive={selectedBoardId === board.id}
              onClick={() => setSelectedBoardId(board.id)}
            />
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-muted-foreground">Loading changelog...</div>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={DocumentTextIcon}
          title="No updates yet"
          description="Check back soon for the latest product updates and shipped features."
        />
      ) : (
        <div className="divide-y divide-border/40">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              className="py-10 first:pt-0 animate-in fade-in duration-200 fill-mode-backwards"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <ChangelogEntryCard
                id={entry.id}
                title={entry.title}
                content={entry.content}
                contentJson={entry.contentJson}
                publishedAt={entry.publishedAt}
                linkedPosts={entry.linkedPosts}
              />
            </div>
          ))}

          {/* Load more */}
          {hasNextPage && (
            <div className="flex justify-center pt-8">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface BoardTabProps {
  label: string
  isActive: boolean
  isPrivate?: boolean
  onClick: () => void
}

function BoardTab({ label, isActive, isPrivate, onClick }: BoardTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {label}
      {isPrivate && <LockClosedIcon className="h-3 w-3 opacity-70" />}
    </button>
  )
}
