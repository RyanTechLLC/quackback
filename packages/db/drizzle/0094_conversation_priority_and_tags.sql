-- Conversation triage metadata: an agent-set priority + reusable labels.
-- Both additive/backfill-safe. priority's constant default backfills every
-- existing row to 'none' with no table rewrite (PG 11+). conversation_tags
-- reuses the shared "tags" vocabulary (it was dropped in 0091; re-added here to
-- unify chat + feedback labels under one vocabulary).

ALTER TABLE "conversations" ADD COLUMN "priority" text DEFAULT 'none' NOT NULL;

CREATE TABLE IF NOT EXISTS "conversation_tags" (
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_tags_pk"
  ON "conversation_tags" ("conversation_id", "tag_id");

CREATE INDEX IF NOT EXISTS "conversation_tags_conversation_id_idx"
  ON "conversation_tags" ("conversation_id");

CREATE INDEX IF NOT EXISTS "conversation_tags_tag_id_idx"
  ON "conversation_tags" ("tag_id");
