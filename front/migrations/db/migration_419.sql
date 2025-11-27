-- Migration created on Nov 26, 2025
CREATE INDEX CONCURRENTLY "conversations_workspace_id_created_at_idx"
ON "conversations" ("workspaceId", "createdAt");
