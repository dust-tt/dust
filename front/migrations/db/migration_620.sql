-- Migration created on May 4, 2026
-- Drop userId from project_todo_sources: identity is now (workspaceId, itemId)
-- alone. One itemId maps to exactly one action item which maps to one user, so
-- the column was redundant with the todo's own userId.

DROP INDEX CONCURRENTLY IF EXISTS "project_todo_sources_ws_item_user_unique_idx";
DROP INDEX CONCURRENTLY IF EXISTS "project_todo_sources_userId_idx";

ALTER TABLE "project_todo_sources"
    DROP COLUMN IF EXISTS "userId";

CREATE UNIQUE INDEX CONCURRENTLY "project_todo_sources_ws_todo_source_unique_idx"
    ON "project_todo_sources" ("workspaceId", "projectTodoId", "sourceType", "sourceId");
