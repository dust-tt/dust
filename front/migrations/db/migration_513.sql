-- Migration created on Feb 16, 2026
-- Speeds up agentic descendant traversal in cost-threshold logging.
CREATE INDEX CONCURRENTLY "user_messages_agentic_origin_workspace_idx"
  ON "user_messages" ("agenticOriginMessageId", "workspaceId");
