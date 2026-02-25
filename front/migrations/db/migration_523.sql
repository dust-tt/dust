-- Migration created on Feb 25, 2026
CREATE INDEX CONCURRENTLY "conversations_workspace_id_updated_at_idx" ON "conversations" ("workspaceId", "updatedAt");
