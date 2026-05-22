-- Backfill: boards moderation.requireApproval -> 'inherit'.
-- Pre-Phase-1 boards carry an explicit 'none'; moving them to 'inherit'
-- makes every board follow the workspace default. The default ships as
-- 'none', so effective behavior is unchanged.
UPDATE "boards"
SET "moderation" = jsonb_set("moderation", '{requireApproval}', '"inherit"', true)
WHERE "moderation" IS NOT NULL
  AND "moderation" ->> 'requireApproval' = 'none';
