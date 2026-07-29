-- conversationId functionally determines workspaceId, but the planner multiplies both
-- selectivities, underestimating conversation-scoped fetches by ~60x on large workspaces.
-- Functional-dependency statistics let it use the conversationId selectivity alone.
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE STATISTICS IF NOT EXISTS messages_workspace_id_conversation_id_dependencies (dependencies)
  ON "workspaceId", "conversationId" FROM messages;
ANALYZE messages;
