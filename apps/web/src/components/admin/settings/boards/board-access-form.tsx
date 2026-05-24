import { useForm } from 'react-hook-form'
import { Link } from '@tanstack/react-router'
import { GlobeAltIcon, LockClosedIcon, TagIcon, UsersIcon } from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/shared/form-error'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form'
import { SegmentMultiSelect } from '@/components/admin/segments/segment-multi-select'
import { useUpdateBoardAccess } from '@/lib/client/mutations'
import { useSegments } from '@/lib/client/hooks/use-segments-queries'
import type { BoardId } from '@quackback/ids'
import type { BoardAudience } from '@/lib/shared/db-types'

/**
 * Board visibility form. Backed by `audience` (BoardAudience union).
 *
 * Exposes all four audience kinds as radio buttons:
 *   - public          anyone, signed-in or not
 *   - authenticated   any signed-in portal user
 *   - team            admins and members only
 *   - segments        members of one or more named segments
 *
 * When `segments` is selected the SegmentMultiSelect appears below the
 * radio group, preselected from the board's current `segmentIds` if any.
 * Save is disabled while the selection is empty (server requires at
 * least one segment) — explicit, no silent fallback to a different kind.
 *
 * Post moderation is workspace-wide (Settings → Permissions), not per-board.
 *
 * Submit calls `updateBoardAccessFn` (admin-only, audited) — distinct from
 * the general board update path so members can't change board visibility.
 */

interface Board {
  id: BoardId
  audience: BoardAudience
}

interface BoardAccessFormProps {
  board: Board
}

type RadioVisibility = 'public' | 'authenticated' | 'team' | 'segments'

interface FormValues {
  visibility: RadioVisibility
  segmentIds: string[]
}

function audienceToFormValues(audience: BoardAudience): FormValues {
  switch (audience.kind) {
    case 'public':
    case 'authenticated':
    case 'team':
      return { visibility: audience.kind, segmentIds: [] }
    case 'segments':
      return { visibility: 'segments', segmentIds: audience.segmentIds }
  }
}

function formValuesToAudience(values: FormValues): BoardAudience {
  if (values.visibility === 'segments') {
    return { kind: 'segments', segmentIds: values.segmentIds }
  }
  return { kind: values.visibility }
}

export function BoardAccessForm({ board }: BoardAccessFormProps) {
  const mutation = useUpdateBoardAccess()
  const segmentsQuery = useSegments()

  const form = useForm<FormValues>({
    // Preserves the board's existing segmentIds when it's already on a
    // segments audience so admins editing aren't surprised by an empty
    // selection. Switching back from another kind starts empty.
    defaultValues: audienceToFormValues(board.audience),
  })

  const visibility = form.watch('visibility')
  const segmentIds = form.watch('segmentIds')

  const isSegments = visibility === 'segments'
  const noSegmentsSelected = isSegments && segmentIds.length === 0

  async function onSubmit(values: FormValues) {
    mutation.mutate({
      boardId: board.id,
      audience: formValuesToAudience(values),
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {mutation.isError && <FormError message={mutation.error?.message ?? 'An error occurred'} />}

        <FormField
          control={form.control}
          name="visibility"
          render={({ field }) => (
            <FormItem className="space-y-4">
              <div>
                <FormLabel className="text-base">Board Visibility</FormLabel>
                <FormDescription>Control who can see this board on your portal</FormDescription>
              </div>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                    const next = value as RadioVisibility
                    field.onChange(next)
                    // Leaving segments — clear the selection so a later
                    // re-entry starts fresh and a stale array can't
                    // sneak back into the payload from a hidden field.
                    if (next !== 'segments') {
                      form.setValue('segmentIds', [])
                    }
                  }}
                  value={field.value}
                  className="grid gap-3"
                >
                  <AccessOption
                    id="visibility-public"
                    icon={GlobeAltIcon}
                    label="Public"
                    description="Anyone can view this board on your portal, including unsigned visitors. Signed-in users can vote, comment, and submit feedback."
                  />
                  <AccessOption
                    id="visibility-authenticated"
                    icon={UsersIcon}
                    label="Authenticated"
                    description="Any signed-in portal user can view this board. Hidden from anonymous visitors and search indexes."
                  />
                  <AccessOption
                    id="visibility-team"
                    icon={LockClosedIcon}
                    label="Team only"
                    description="Only admins and team members can view this board."
                  />
                  <AccessOption
                    id="visibility-segments"
                    icon={TagIcon}
                    label="Specific segments"
                    description="Only members of the segments you pick can view this board."
                  />
                </RadioGroup>
              </FormControl>
            </FormItem>
          )}
        />

        {isSegments && (
          <FormField
            control={form.control}
            name="segmentIds"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <FormLabel className="text-sm">Allowed segments</FormLabel>
                  <Link
                    to="/admin/settings/people"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Manage segments →
                  </Link>
                </div>
                {segmentsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading segments…</p>
                ) : segmentsQuery.isError ? (
                  <p className="text-xs text-destructive">
                    Could not load segments. Reload the page to try again.
                  </p>
                ) : (segmentsQuery.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No segments defined yet — create one on the{' '}
                    <Link to="/admin/settings/people" className="text-primary hover:underline">
                      People page
                    </Link>
                    , then come back to pick it.
                  </p>
                ) : (
                  <SegmentMultiSelect
                    segments={segmentsQuery.data ?? []}
                    value={field.value}
                    onChange={(next) => field.onChange(next)}
                    disabled={mutation.isPending}
                  />
                )}
                {noSegmentsSelected && (segmentsQuery.data ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Pick at least one segment to save.
                  </p>
                )}
              </FormItem>
            )}
          />
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending || noSegmentsSelected}>
            {mutation.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Form>
  )
}

/** Single radio card — same visual treatment for all four kinds. */
function AccessOption({
  id,
  icon: Icon,
  label,
  description,
}: {
  id: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
}) {
  return (
    <Label
      htmlFor={id}
      className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
    >
      <RadioGroupItem value={id.replace(/^visibility-/, '')} id={id} className="mt-0.5" />
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span className="font-medium">{label}</span>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </Label>
  )
}
