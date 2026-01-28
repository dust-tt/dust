-- Migration created on Jan 23, 2026

CREATE UNIQUE INDEX CONCURRENTLY "keys_workspace_name_unique_idx"
    ON "public"."keys" ("workspaceId", "name");

-- Make name column NOT NULL (after backfill has been run)
ALTER TABLE "public"."keys" ALTER COLUMN "name" SET NOT NULL;
