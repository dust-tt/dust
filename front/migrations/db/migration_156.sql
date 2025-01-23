-- Migration created on Jan 23, 2025
ALTER TABLE "public"."group_vaults" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill
UPDATE "public"."group_vaults" AS gv
SET "workspaceId" = g."workspaceId"
FROM "public"."groups" AS g
WHERE gv."groupId" = g.id;

-- Make the column not null
ALTER TABLE "public"."group_vaults" ALTER COLUMN "workspaceId" SET NOT NULL;