-- Same rationale as messages (20260722195624): conversationId functionally determines
-- workspaceId, but the planner multiplies both selectivities, underestimating the
-- (workspaceId, conversationId) scans on the message side tables (est 3 vs actual ~1700
-- on large conversations). Functional-dependency statistics let it use the conversationId
-- selectivity alone.
-- Timeout: these exact ANALYZEs ran on prod cell-00000 during 20260722200411 in 0.3-4.2s;
-- 60s is >10x headroom.
SET SESSION statement_timeout = 60000;
SET SESSION lock_timeout = 3000;
CREATE STATISTICS IF NOT EXISTS user_messages_workspace_id_conversation_id_dependencies (dependencies)
  ON "workspaceId", "conversationId" FROM user_messages;
ANALYZE user_messages;

CREATE STATISTICS IF NOT EXISTS agent_messages_workspace_id_conversation_id_dependencies (dependencies)
  ON "workspaceId", "conversationId" FROM agent_messages;
ANALYZE agent_messages;

CREATE STATISTICS IF NOT EXISTS content_fragments_workspace_id_conversation_id_dependencies (dependencies)
  ON "workspaceId", "conversationId" FROM content_fragments;
ANALYZE content_fragments;

CREATE STATISTICS IF NOT EXISTS compaction_messages_workspace_id_conversation_id_dependencies (dependencies)
  ON "workspaceId", "conversationId" FROM compaction_messages;
ANALYZE compaction_messages;
