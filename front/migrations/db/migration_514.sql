-- Migration created on Feb 17, 2026
-- Speeds up agentic descendant traversal in cost-threshold logging.
CREATE INDEX CONCURRENTLY "user_messages_workspace_agentic_origin_idx"
  ON "user_messages" ("workspaceId", "agenticOriginMessageId");
