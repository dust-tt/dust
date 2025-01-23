------------------------------------------
------------------ clone -----------------
------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- clones -> apps -> workspaces
UPDATE clones
SET "workspaceId" = apps."workspaceId"
FROM apps
WHERE clones."fromId" = apps.id;