-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_retrieval_actions_workspace_id_agent_message_id" ON "agent_retrieval_actions" ("workspaceId", "agentMessageId");
