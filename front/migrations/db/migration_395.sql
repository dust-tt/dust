-- Migration created on Oct 29, 2025
CREATE INDEX CONCURRENTLY "agent_messages_workspace_id_agent_configuration_id" ON "agent_messages" ("workspaceId", "agentConfigurationId");
CREATE INDEX CONCURRENTLY "messages_workspace_id_conversation_id_created_at" ON "messages" ("workspaceId", "conversationId", "createdAt");
