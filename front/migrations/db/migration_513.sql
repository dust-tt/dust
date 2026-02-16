-- Migration created on Feb 16, 2026
-- Speeds up agentic descendant traversal in cost-threshold logging.
CREATE INDEX CONCURRENTLY "user_messages_workspace_id_agentic_origin_type_idx"
  ON "user_messages" ("workspaceId", "agenticOriginMessageId", "agenticMessageType");
