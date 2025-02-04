-- Migration created on Jan 23, 2025
ALTER TABLE "public"."clones"
ADD COLUMN "workspaceId" BIGINT
REFERENCES "workspaces" ("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

------------------------------------------
------------------ clone -----------------
------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- clones -> apps -> workspaces
UPDATE clones
SET "workspaceId" = apps."workspaceId"
FROM apps
WHERE clones."fromId" = apps.id;

ALTER TABLE "public"."clones" ALTER COLUMN "workspaceId" SET NOT NULL;