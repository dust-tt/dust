CREATE UNIQUE INDEX CONCURRENTLY "project_todo_sources_ws_unique_idx" ON "project_todo_sources" (
    "workspaceId",
    "projectTodoId",
    "sourceType",
    "sourceId"
)
