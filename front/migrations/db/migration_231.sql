-- Migration created on May 12, 2025
CREATE INDEX CONCURRENTLY "agent_search_labels_actions_workspace_id_agent_message_id" ON "agent_search_labels_actions" ("workspaceId", "agentMessageId");
