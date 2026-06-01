interface FirstResponseData {
  respondedCount: number
  awaitingCount: number
  medianSeconds: number | null
  withinTargetPct: number | null
  targetMinutes: number | null
}

/** Humanize a duration in seconds as a compact "1h 20m" / "5m" / "45s". */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

export function AnalyticsFirstResponseCard({
  firstResponse,
}: {
  firstResponse: FirstResponseData
}) {
  const { respondedCount, awaitingCount, medianSeconds, withinTargetPct, targetMinutes } =
    firstResponse

  if (respondedCount === 0 && awaitingCount === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center text-sm text-muted-foreground">
        No conversations for this period
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 divide-x divide-border/50 sm:grid-cols-3">
      <Stat
        label="Median first response"
        value={medianSeconds === null ? '—' : formatDuration(medianSeconds)}
      />
      <Stat
        label={targetMinutes ? `Within ${targetMinutes}m` : 'Within target'}
        value={withinTargetPct === null ? '—' : `${withinTargetPct}%`}
        hint={targetMinutes ? undefined : 'Set a target in Live Chat settings'}
      />
      <Stat label="Awaiting reply" value={awaitingCount.toLocaleString()} />
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-4 first:pl-0">
      <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
