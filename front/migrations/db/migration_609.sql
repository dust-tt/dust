-- Migration created on Apr 28, 2026
DROP INDEX IF EXISTS "project_todo_sources_ws_item_user_unique_idx";

CREATE UNIQUE INDEX CONCURRENTLY "project_todo_sources_ws_todo_source_user_unique_idx" ON
    "project_todo_sources" ("workspaceId", "projectTodoId", "sourceType", "sourceId", "userId");
