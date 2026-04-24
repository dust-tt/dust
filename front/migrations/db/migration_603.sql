-- Migration created on Apr 22, 2026
-- project_todo_sources identity shifts from (workspace, projectTodoId,
-- sourceType, sourceId) to (workspace, itemId, userId). itemId is the sId of
-- the takeaway item that produced this source link; userId is denormalized
-- from the parent project_todo row so uniqueness can be enforced at the DB
-- level without a trigger.

ALTER TABLE "project_todo_sources"
    ADD COLUMN "itemId" VARCHAR(255);

ALTER TABLE "project_todo_sources"
    ADD COLUMN "userId" BIGINT;

-- Backfill from the linked project_todo row. Legacy rows were keyed per-doc,
-- so itemId is set to sourceId as a stand-in; subsequent merges will
-- overwrite these with real takeaway-item sIds.
UPDATE "project_todo_sources" s
SET "itemId" = s."sourceId",
    "userId" = pt."userId"
FROM "project_todos" pt
WHERE s."projectTodoId" = pt."id";

-- Collapse legacy (workspaceId, itemId, userId) conflicts before enforcing
-- uniqueness. Keep the highest-id row per group (most recent write).
DELETE
FROM "project_todo_sources" s
    USING "project_todo_sources" s2
WHERE s."workspaceId" = s2."workspaceId"
  AND s."itemId" = s2."itemId"
  AND s."userId" = s2."userId"
  AND s."id" < s2."id";

ALTER TABLE "project_todo_sources"
    ALTER COLUMN "itemId" SET NOT NULL;

ALTER TABLE "project_todo_sources"
    ALTER COLUMN "userId" SET NOT NULL;

DROP INDEX IF EXISTS "project_todo_sources_ws_unique_idx";

CREATE UNIQUE INDEX CONCURRENTLY "project_todo_sources_ws_item_user_unique_idx"
    ON "project_todo_sources" ("workspaceId", "itemId", "userId");

CREATE INDEX CONCURRENTLY "project_todo_sources_userId_idx"
    ON "project_todo_sources" ("userId");
