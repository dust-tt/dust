-- Migration created on Mar 30, 2026
-- Add groupIds array column to keys table for multi-space API key support

-- Step 1: Add groupIds column (nullable for backfill)
ALTER TABLE "keys" ADD COLUMN "groupIds" INTEGER[];

-- Step 2a: Backfill 'default' scope keys with [globalGroupId, groupId] (deduped)
UPDATE "keys" SET "groupIds" = ARRAY(
  SELECT DISTINCT unnest FROM unnest(ARRAY[
    (SELECT id FROM "groups" WHERE "workspaceId" = "keys"."workspaceId" AND "kind" = 'global' LIMIT 1),
    "keys"."groupId"
  ])
) WHERE "scope" = 'default';

-- Step 2b: Backfill 'restricted_group_only' scope keys (preserve original behavior)
UPDATE "keys" SET "groupIds" = ARRAY["groupId"]
WHERE "scope" = 'restricted_group_only';

-- Step 3: Make NOT NULL
ALTER TABLE "keys" ALTER COLUMN "groupIds" SET NOT NULL;

-- Step 4: Index
CREATE INDEX CONCURRENTLY "keys_group_ids" ON "keys" ("groupIds");
