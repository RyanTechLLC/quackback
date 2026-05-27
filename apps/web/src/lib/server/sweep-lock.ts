/**
 * Lightweight cross-instance mutex for scheduled maintenance tasks.
 *
 * Uses a Postgres table as a distributed lock so daily sweepers
 * (audit log prune, invite expiry) execute at most once across all
 * replicas in a multi-instance deployment.
 *
 * Mechanism: INSERT ON CONFLICT DO UPDATE with a `setWhere` expiry
 * guard. The first instance that inserts a row for a given lock name
 * wins; others get zero rows returned via `.returning()` and skip.
 * On the next interval tick the existing row has expired, so the
 * INSERT succeeds for whoever claims it first.
 *
 * If a process dies mid-sweep, the TTL auto-releases the lock so the
 * next interval tick proceeds — no orphaned locks left behind.
 */
import { sql } from 'drizzle-orm'
import { db } from '@/lib/server/db'
import { getExecuteRows } from '@/lib/server/utils/execute-rows'

/**
 * Execute `fn` if no other instance currently holds the named sweep lock.
 *
 * @param name   - unique lock name (e.g. 'audit_prune', 'invite_sweep')
 * @param ttlMs  - how long the lock is held before auto-expiry. Must be
 *                 longer than the expected runtime of `fn`.
 * @param fn     - the sweeper to run. Called only when the lock was acquired.
 */
export async function withSweepLock(
  name: string,
  ttlMs: number,
  fn: () => Promise<void>
): Promise<void> {
  // INSERT ON CONFLICT DO UPDATE with setWhere: only take over an expired
  // row. The first INSERT wins; subsequent callers get zero rows returned
  // because the existing row hasn't expired yet.
  const result = await db.execute(sql`
    INSERT INTO sweep_lock (name, acquired_at, expires_at)
    VALUES (${name}, now(), now() + make_interval(secs => ${ttlMs / 1000}))
    ON CONFLICT (name) DO UPDATE
      SET acquired_at = now(),
          expires_at = now() + make_interval(secs => ${ttlMs / 1000})
      WHERE sweep_lock.expires_at < now()
    RETURNING name
  `)

  if (getExecuteRows(result).length === 0) return // Another instance owns this lock

  await fn()
}
