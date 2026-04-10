-- Migration created on Apr 10, 2026
-- Replace sourceConversationId (FK to conversations) with agnostic sourceId (string)
-- in project_todo_sources, aligning it with takeaway_sources.
ALTER TABLE "project_todo_sources"
  ADD COLUMN "sourceId" VARCHAR(255);

UPDATE "project_todo_sources"
SET "sourceId" = "sourceConversationId"::TEXT
WHERE "sourceConversationId" IS NOT NULL;

DELETE FROM "project_todo_sources"
WHERE "sourceId" IS NULL;

ALTER TABLE "project_todo_sources"
  ALTER COLUMN "sourceId" SET NOT NULL;

ALTER TABLE "project_todo_sources"
  DROP COLUMN "sourceConversationId";

DROP INDEX CONCURRENTLY IF EXISTS "project_todo_sources_sourceConversationId_idx";
CREATE INDEX CONCURRENTLY "project_todo_sources_sourceId_idx" ON "project_todo_sources" ("sourceId");
