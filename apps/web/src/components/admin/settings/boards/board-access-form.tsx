import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ExclamationTriangleIcon,
  GlobeAltIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@heroicons/react/24/solid'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { settingsQueries } from '@/lib/client/queries/settings'
import type { BoardId } from '@quackback/ids'
import {
  ACCESS_TIER_RANK,
  type AccessTier,
  type BoardAccess,
  DEFAULT_BOARD_ACCESS,
} from '@/lib/shared/db-types'
import { TierSelect } from './tier-select'

/**
 * Per-board access matrix form. Backed by the BoardAccess shape
 * (view / comment / submit tiers + segmentIds + approval flags).
 *
 * Layout (top to bottom):
 *  1. Quick presets card grid — Public / Auth-only / Team / Custom.
 *     Selecting a preset fills the tier row; Custom auto-selects when
 *     the form drifts from any known preset.
 *  2. View tier picker (full 4-option TierSelect).
 *  3. Comment tier picker — minTier = view so it can't be more permissive.
 *  4. Submit tier picker — same rank invariant.
 *  5. Segments multi-select — only rendered when any tier is 'segments'.
 *  6. Approval card — two checkboxes (hold posts / hold comments).
 *  7. Save button — disabled while segments are required but unselected.
 *
 * Submit calls `updateBoardAccessFn` (admin-only, audited) — distinct from
 * the general board update path so members can't change board visibility.
 */

interface Board {
  id: BoardId
  access: BoardAccess
}

interface BoardAccessFormProps {
  board: Board
}

type PresetName = 'public' | 'authenticated' | 'team' | 'custom'

const PRESET_META: Record<
  Exclude<PresetName, 'custom'>,
  {
    label: string
    description: string
    icon: React.ComponentType<{ className?: string }>
    tiers: Pick<BoardAccess, 'view' | 'comment' | 'submit'>
  }
> = {
  public: {
    label: 'Public',
    description: 'Anyone can view, vote, comment, and submit feedback.',
    icon: GlobeAltIcon,
    tiers: { view: 'anonymous', comment: 'anonymous', submit: 'anonymous' },
  },
  authenticated: {
    label: 'Auth-only',
    description: 'Sign in to see anything.',
    icon: UsersIcon,
    tiers: {
      view: 'authenticated',
      comment: 'authenticated',
      submit: 'authenticated',
    },
  },
  team: {
    label: 'Team only',
    description: 'Hidden from the portal.',
    icon: LockClosedIcon,
    tiers: { view: 'team', comment: 'team', submit: 'team' },
  },
}

/** Find the preset the current form values correspond to, if any.
 *  We require tier match + approval flags both off; for the segments-bearing
 *  case (which today no preset uses) we also require segmentIds to be empty
 *  so picked segments don't silently survive a preset switch. */
function detectPreset(access: BoardAccess): PresetName {
  for (const [name, meta] of Object.entries(PRESET_META) as [
    Exclude<PresetName, 'custom'>,
    (typeof PRESET_META)[Exclude<PresetName, 'custom'>],
  ][]) {
    const tiersMatch =
      access.view === meta.tiers.view &&
      access.comment === meta.tiers.comment &&
      access.submit === meta.tiers.submit
    const approvalOff = !access.approval.posts && !access.approval.comments
    const segmentsAlignWithTier = meta.tiers.view !== 'segments' || access.segmentIds.length === 0
    if (tiersMatch && approvalOff && segmentsAlignWithTier) {
      return name
    }
  }
  return 'custom'
}

function applyPreset(name: Exclude<PresetName, 'custom'>, current: BoardAccess): BoardAccess {
  const tiers = PRESET_META[name].tiers
  return {
    ...current,
    view: tiers.view,
    comment: tiers.comment,
    submit: tiers.submit,
    approval: { posts: false, comments: false },
  }
}

/** Inline warning rendered under a tier section when the chosen tier is
 *  'anonymous' but the matching workspace-wide kill switch is off. Surfaces
 *  the silent-conflict at config time so admins don't ship a board that
 *  invites anonymous traffic the workspace will then block. */
function KillSwitchWarning({ feature }: { feature: 'voting' | 'commenting' | 'posting' }) {
  const verb =
    feature === 'voting'
      ? 'view but not vote'
      : feature === 'commenting'
        ? 'view but not comment'
        : 'view but not submit'
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
      <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        Anonymous {feature} is off workspace-wide.{' '}
        <Link to="/admin/settings/moderation" className="underline">
          Enable in Moderation
        </Link>{' '}
        or anonymous users will {verb}.
      </span>
    </p>
  )
}

export function BoardAccessForm({ board }: BoardAccessFormProps) {
  const mutation = useUpdateBoardAccess()
  const segmentsQuery = useSegments()
  // Non-suspense — the warnings degrade gracefully if portalConfig hasn't
  // landed yet (the form stays usable; the conflict surface just appears
  // once data is in cache).
  const portalConfigQuery = useQuery(settingsQueries.portalConfig())
  const features = portalConfigQuery.data?.features

  const form = useForm<BoardAccess>({
    defaultValues: board.access ?? DEFAULT_BOARD_ACCESS,
  })

  // Sync form state when the server-side board.access changes (e.g. successful
  // save + cache update, or rollback on error). Serialized access powers the
  // dep check because deep-eq on the nested object is the source of truth.
  const accessKey = JSON.stringify(board.access)
  useEffect(() => {
    form.reset(board.access ?? DEFAULT_BOARD_ACCESS)
  }, [accessKey, board.access, form])

  const values = form.watch()
  const anySegments = useMemo(
    () =>
      values.view === 'segments' || values.comment === 'segments' || values.submit === 'segments',
    [values.view, values.comment, values.submit]
  )
  const needsSegments = anySegments && values.segmentIds.length === 0
  const preset = detectPreset(values)

  async function onSubmit(next: BoardAccess) {
    // Defense-in-depth: the button is disabled when segments are required
    // but empty; this re-check covers Enter-key submit from a focused input.
    if (
      (next.view === 'segments' || next.comment === 'segments' || next.submit === 'segments') &&
      next.segmentIds.length === 0
    ) {
      return
    }
    mutation.mutate({ boardId: board.id, access: next })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {mutation.isError && <FormError message={mutation.error?.message ?? 'An error occurred'} />}

        {/* ────────── Quick presets ────────── */}
        <div className="space-y-3">
          <div>
            <FormLabel className="text-base">Quick presets</FormLabel>
            <FormDescription>
              Start from a common configuration. Custom is selected automatically when you tweak
              anything below.
            </FormDescription>
          </div>
          <RadioGroup
            value={preset}
            onValueChange={(p) => {
              if (p !== 'custom') {
                const next = applyPreset(p as Exclude<PresetName, 'custom'>, values)
                form.reset(next)
              }
            }}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {(['public', 'authenticated', 'team'] as const).map((name) => {
              const meta = PRESET_META[name]
              const id = `preset-${name}`
              const Icon = meta.icon
              return (
                <Label
                  key={name}
                  htmlFor={id}
                  className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                >
                  <RadioGroupItem value={name} id={id} className="mt-0.5" />
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-sm font-medium">{meta.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {meta.description}
                    </p>
                  </div>
                </Label>
              )
            })}
            <Label
              htmlFor="preset-custom"
              className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
            >
              <RadioGroupItem value="custom" id="preset-custom" className="mt-0.5" />
              <div className="flex-1 space-y-0.5">
                <span className="text-sm font-medium">Custom</span>
                <p className="text-[11px] text-muted-foreground leading-tight">Per-action tiers.</p>
              </div>
            </Label>
          </RadioGroup>
        </div>

        {/* ────────── View ────────── */}
        <FormField
          control={form.control}
          name="view"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div>
                <FormLabel className="text-base">Who can view the board and vote?</FormLabel>
                <FormDescription>
                  Voting follows the same rule as viewing. To gate voting separately, use the
                  workspace anonymous-voting toggle in Moderation.
                </FormDescription>
              </div>
              <FormControl>
                <TierSelect
                  value={field.value as AccessTier}
                  onChange={(v) => field.onChange(v)}
                  ariaLabel="View tier"
                />
              </FormControl>
              {values.view === 'anonymous' && features?.anonymousVoting === false && (
                <KillSwitchWarning feature="voting" />
              )}
            </FormItem>
          )}
        />

        {/* ────────── Comment ────────── */}
        <FormField
          control={form.control}
          name="comment"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div>
                <FormLabel className="text-base">Who can comment?</FormLabel>
              </div>
              <FormControl>
                <TierSelect
                  value={field.value as AccessTier}
                  onChange={(v) => {
                    // Rank invariant: comment can't be more permissive than view.
                    if (ACCESS_TIER_RANK[v] >= ACCESS_TIER_RANK[values.view]) {
                      field.onChange(v)
                    }
                  }}
                  minTier={values.view}
                  ariaLabel="Comment tier"
                />
              </FormControl>
              {values.comment === 'anonymous' && features?.anonymousCommenting === false && (
                <KillSwitchWarning feature="commenting" />
              )}
            </FormItem>
          )}
        />

        {/* ────────── Submit ────────── */}
        <FormField
          control={form.control}
          name="submit"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div>
                <FormLabel className="text-base">Who can submit new posts?</FormLabel>
              </div>
              <FormControl>
                <TierSelect
                  value={field.value as AccessTier}
                  onChange={(v) => {
                    if (ACCESS_TIER_RANK[v] >= ACCESS_TIER_RANK[values.view]) {
                      field.onChange(v)
                    }
                  }}
                  minTier={values.view}
                  ariaLabel="Submit tier"
                />
              </FormControl>
              {values.submit === 'anonymous' && features?.anonymousPosting === false && (
                <KillSwitchWarning feature="posting" />
              )}
            </FormItem>
          )}
        />

        {/* ────────── Segments (conditional) ────────── */}
        {anySegments && (
          <FormField
            control={form.control}
            name="segmentIds"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <FormLabel className="text-base">Segments</FormLabel>
                  <Link
                    to="/admin/settings/people"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Manage segments →
                  </Link>
                </div>
                <FormDescription>
                  Used wherever &quot;Segments&quot; is selected above.
                </FormDescription>
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
                {needsSegments && (segmentsQuery.data ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Pick at least one segment to save.
                  </p>
                )}
              </FormItem>
            )}
          />
        )}

        {/* ────────── Approval ────────── */}
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-4 w-4 text-muted-foreground" />
            <FormLabel className="text-base">Approval</FormLabel>
          </div>
          <FormDescription>
            Hold new submissions for review before they go live. For finer rules (e.g. only
            anonymous), use the workspace default in{' '}
            <Link to="/admin/settings/moderation" className="text-primary hover:underline">
              Moderation
            </Link>
            .
          </FormDescription>
          <FormField
            control={form.control}
            name="approval.posts"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                </FormControl>
                <FormLabel className="text-sm font-normal cursor-pointer">
                  Hold new posts for review
                </FormLabel>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="approval.comments"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                </FormControl>
                <FormLabel className="text-sm font-normal cursor-pointer">
                  Hold new comments for review
                </FormLabel>
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Team members and admins always have full access.</p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending || needsSegments}>
            {mutation.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
