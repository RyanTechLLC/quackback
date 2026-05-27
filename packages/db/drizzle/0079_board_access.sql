ALTER TABLE "boards" ADD COLUMN "access" jsonb DEFAULT '{"view":"anonymous","comment":"anonymous","submit":"anonymous","segmentIds":[],"approval":{"posts":false,"comments":false}}'::jsonb NOT NULL;
--> statement-breakpoint
-- ELSE 'anonymous' on every CASE is fail-safe: an unexpected audience.kind
-- would otherwise yield NULL and trip the NOT NULL constraint on the new
-- access column, halting the migration. 'anonymous' matches the column's
-- own default (DEFAULT_BOARD_ACCESS) so the row stays consistent.
UPDATE "boards" SET "access" = jsonb_build_object(
  'view',
    CASE audience->>'kind'
      WHEN 'public'        THEN 'anonymous'
      WHEN 'authenticated' THEN 'authenticated'
      WHEN 'team'          THEN 'team'
      WHEN 'segments'      THEN 'segments'
      ELSE 'anonymous'
    END,
  'comment',
    CASE audience->>'kind'
      WHEN 'public'        THEN 'anonymous'
      WHEN 'authenticated' THEN 'authenticated'
      WHEN 'team'          THEN 'team'
      WHEN 'segments'      THEN 'segments'
      ELSE 'anonymous'
    END,
  'submit',
    CASE audience->>'kind'
      WHEN 'public'        THEN 'anonymous'
      WHEN 'authenticated' THEN 'authenticated'
      WHEN 'team'          THEN 'team'
      WHEN 'segments'      THEN 'segments'
      ELSE 'anonymous'
    END,
  'segmentIds',
    COALESCE(audience->'segmentIds', '[]'::jsonb),
  'approval',
    '{"posts":false,"comments":false}'::jsonb
);
