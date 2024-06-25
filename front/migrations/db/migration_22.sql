-- Migration created on Jun 13, 2024
CREATE INDEX CONCURRENTLY "runs_workspace_id_created_at" ON "runs" ("workspaceId", "createdAt");
