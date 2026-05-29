import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PlusIcon,
  MegaphoneIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  LockClosedIcon,
} from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { cn, slugify } from '@/lib/shared/utils'
import { changelogQueries } from '@/lib/client/queries/changelog'
import {
  useCreateChangelogBoard,
  useUpdateChangelogBoard,
  useDeleteChangelogBoard,
} from '@/lib/client/mutations/changelog'
import type { ChangelogBoardSummary } from '@/lib/server/domains/changelog'

interface ChangelogBoardSidebarProps {
  selectedBoardId: string | null
  onSelectBoard: (boardId: string | null) => void
}

export function ChangelogBoardSidebar({
  selectedBoardId,
  onSelectBoard,
}: ChangelogBoardSidebarProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [editingBoard, setEditingBoard] = useState<ChangelogBoardSummary | null>(null)
  const [deletingBoard, setDeletingBoard] = useState<ChangelogBoardSummary | null>(null)

  const { data: boards, isLoading } = useQuery(changelogQueries.boards())
  const createBoard = useCreateChangelogBoard()
  const updateBoard = useUpdateChangelogBoard()
  const deleteBoard = useDeleteChangelogBoard()

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const isPublic = formData.get('isPublic') === 'on'

    try {
      const newBoard = await createBoard.mutateAsync({
        name,
        slug: slugify(name),
        description: description || undefined,
        isPublic,
      })
      setIsCreateDialogOpen(false)
      onSelectBoard(String(newBoard.id))
    } catch (error) {
      console.error('Failed to create changelog board:', error)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingBoard) return

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const isPublic = formData.get('isPublic') === 'on'

    try {
      await updateBoard.mutateAsync({
        id: editingBoard.id,
        name,
        description,
        isPublic,
      })
      setIsEditDialogOpen(false)
      setEditingBoard(null)
    } catch (error) {
      console.error('Failed to update changelog board:', error)
    }
  }

  const handleDelete = async () => {
    if (!deletingBoard) return

    try {
      await deleteBoard.mutateAsync(deletingBoard.id)
      setIsDeleteDialogOpen(false)
      setDeletingBoard(null)
      if (selectedBoardId === deletingBoard.id) {
        const next = boards?.find((b) => b.id !== deletingBoard.id)
        onSelectBoard(next ? String(next.id) : null)
      }
    } catch (error) {
      console.error('Failed to delete changelog board:', error)
    }
  }

  const openEditDialog = (board: ChangelogBoardSummary) => {
    setEditingBoard(board)
    setIsEditDialogOpen(true)
  }

  const openDeleteDialog = (board: ChangelogBoardSummary) => {
    setDeletingBoard(board)
    setIsDeleteDialogOpen(true)
  }

  return (
    <aside className="w-64 xl:w-72 shrink-0 flex flex-col border-r border-border/50 bg-card/30 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-2">
        <div className="flex items-center justify-between py-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Changelog boards
          </span>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label="Create changelog board"
                className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <PlusIcon className="h-3 w-3" />
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create changelog board</DialogTitle>
                <DialogDescription>
                  Group changelog entries into a board. Private boards stay visible to your team
                  only and never appear in the public changelog.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="Product Updates" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input
                    id="description"
                    name="description"
                    placeholder="New features, improvements, and fixes"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="isPublic" name="isPublic" defaultChecked />
                  <Label htmlFor="isPublic">Public</Label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createBoard.isPending}>
                    {createBoard.isPending && (
                      <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Create
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="px-5 pb-5">
          {/* "All boards" option */}
          <button
            type="button"
            onClick={() => onSelectBoard(null)}
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer font-medium transition-colors mb-1',
              selectedBoardId === null
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <MegaphoneIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-xs truncate text-left">All boards</span>
          </button>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <ArrowPathIcon className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : boards?.length === 0 ? (
            <EmptyState
              icon={MegaphoneIcon}
              title="No boards yet"
              description="Create your first changelog board"
              className="py-12"
            />
          ) : (
            <div className="space-y-1">
              {boards?.map((board) => (
                <div
                  key={board.id}
                  className={cn(
                    'group flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer font-medium transition-colors',
                    selectedBoardId === board.id
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => onSelectBoard(String(board.id))}
                >
                  <MegaphoneIcon
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      selectedBoardId === board.id ? 'text-primary' : ''
                    )}
                  />
                  <span className="flex-1 text-xs truncate">{board.name}</span>
                  {!board.isPublic && (
                    <LockClosedIcon className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 -mr-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <EllipsisVerticalIcon className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(board)}>
                        <PencilIcon className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => openDeleteDialog(board)}
                      >
                        <TrashIcon className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit changelog board</DialogTitle>
            <DialogDescription>Update this board&apos;s details and visibility.</DialogDescription>
          </DialogHeader>
          {editingBoard && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" name="name" defaultValue={editingBoard.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description (optional)</Label>
                <Input
                  id="edit-description"
                  name="description"
                  defaultValue={editingBoard.description || ''}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch id="edit-isPublic" name="isPublic" defaultChecked={editingBoard.isPublic} />
                <Label htmlFor="edit-isPublic">Public</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateBoard.isPending}>
                  {updateBoard.isPending && <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete changelog board"
        description={`Are you sure you want to delete "${deletingBoard?.name}"? Entries on this board are not deleted, but you'll need to move them to another board.`}
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteBoard.isPending}
        onConfirm={handleDelete}
      />
    </aside>
  )
}
