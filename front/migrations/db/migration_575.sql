-- Migration created on Apr 10, 2026
-- Replace sourceConversationId (FK to conversations) with sourceId (agnostic string)
-- in project_todo_sources to align with TakeawaySourcesModel.

-- Step 1: Drop the FK constraint and old index.
ALTER TABLE "project_todo_sources"
  DROP CONSTRAINT IF EXISTS "project_todo_sources_sourceConversationId_fkey";

DROP INDEX CONCURRENTLY IF EXISTS "project_todo_sources_sourceConversationId_idx";

-- Step 2: Drop old column, add new agnostic string column.
ALTER TABLE "project_todo_sources"
  DROP COLUMN IF EXISTS "sourceConversationId";

ALTER TABLE "project_todo_sources"
  ADD COLUMN IF NOT EXISTS "sourceId" VARCHAR(255) NOT NULL DEFAULT '';

-- Step 3: Create index matching TakeawaySourcesModel pattern.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_todo_sources_sourceType_sourceId_idx"
  ON "project_todo_sources" ("sourceType", "sourceId");
front/lib/project_todo/merge_into_project.ts