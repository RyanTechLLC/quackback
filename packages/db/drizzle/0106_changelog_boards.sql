CREATE TABLE IF NOT EXISTS "changelog_boards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "changelog_boards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "changelog_boards_position_idx" ON "changelog_boards" USING btree ("position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "changelog_boards_is_public_idx" ON "changelog_boards" USING btree ("is_public");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "changelog_boards_deleted_at_idx" ON "changelog_boards" USING btree ("deleted_at");
--> statement-breakpoint
-- Backfill: create a default public board so existing entries have a home.
-- A fixed UUID keeps re-runs / multiple environments deterministic.
INSERT INTO "changelog_boards" ("id", "slug", "name", "description", "is_public", "position")
VALUES ('01920000-0000-7000-8000-000000000001', 'product-updates', 'Product Updates', 'New features, improvements, and fixes', true, 0)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
-- Add board_id nullable first so existing rows can be backfilled before the NOT NULL constraint.
ALTER TABLE "changelog_entries" ADD COLUMN IF NOT EXISTS "board_id" uuid;
--> statement-breakpoint
UPDATE "changelog_entries"
SET "board_id" = (SELECT "id" FROM "changelog_boards" WHERE "slug" = 'product-updates' LIMIT 1)
WHERE "board_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "changelog_entries" ALTER COLUMN "board_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "changelog_entries" ADD CONSTRAINT "changelog_entries_board_id_changelog_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."changelog_boards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "changelog_board_id_idx" ON "changelog_entries" USING btree ("board_id");
