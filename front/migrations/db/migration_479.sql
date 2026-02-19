-- Migration created on Jan 16, 2026
CREATE INDEX CONCURRENTLY "conversations_workspace_id_created_at_idx"
ON "conversations" ("workspaceId", "createdAt");
