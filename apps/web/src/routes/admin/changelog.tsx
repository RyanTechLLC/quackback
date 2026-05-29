import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { ChangelogList, ChangelogModal } from '@/components/admin/changelog'
import { ChangelogBoardSidebar } from '@/components/admin/changelog/changelog-board-sidebar'

const searchSchema = z.object({
  status: z.enum(['draft', 'scheduled', 'published']).optional(),
  entry: z.string().optional(), // Entry ID for modal view
  search: z.string().optional(),
  board: z.string().optional(), // Selected changelog board (filter)
})

export const Route = createFileRoute('/admin/changelog')({
  validateSearch: searchSchema,
  component: ChangelogPage,
})

function ChangelogPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const handleSelectBoard = (boardId: string | null) => {
    void navigate({
      search: (prev) => ({ ...prev, board: boardId ?? undefined }),
    })
  }

  return (
    <div className="flex h-full bg-background">
      <ChangelogBoardSidebar
        selectedBoardId={search.board ?? null}
        onSelectBoard={handleSelectBoard}
      />
      <main className="flex-1 min-w-0 h-full">
        <ChangelogList boardId={search.board} />
        <ChangelogModal entryId={search.entry} />
      </main>
    </div>
  )
}
