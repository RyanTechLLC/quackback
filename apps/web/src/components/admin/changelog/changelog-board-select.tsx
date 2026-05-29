import { useQuery } from '@tanstack/react-query'
import { changelogQueries } from '@/lib/client/queries/changelog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

interface ChangelogBoardSelectProps {
  value: string
  onChange: (boardId: string) => void
  /** Render the field disabled (e.g. while submitting). */
  disabled?: boolean
}

/**
 * Board picker for changelog entries. Loads the workspace's changelog boards
 * and lets the author choose which board the entry belongs to. A board is
 * required to create an entry (it drives public/private visibility).
 */
export function ChangelogBoardSelect({ value, onChange, disabled }: ChangelogBoardSelectProps) {
  const { data: boards, isLoading } = useQuery(changelogQueries.boards())

  return (
    <div className="space-y-1.5">
      <Label htmlFor="changelog-board">Board</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled || isLoading}>
        <SelectTrigger id="changelog-board" className="w-full">
          <SelectValue placeholder={isLoading ? 'Loading boards…' : 'Select a board'} />
        </SelectTrigger>
        <SelectContent>
          {(boards ?? []).map((board) => (
            <SelectItem key={board.id} value={board.id}>
              {board.name}
              {!board.isPublic ? ' (private)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
