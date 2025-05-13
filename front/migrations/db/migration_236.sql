-- Migration created on May 12, 2025
CREATE INDEX CONCURRENTLY "mentions_workspace_id_message_id" ON "mentions" ("workspaceId", "messageId");
CREATE INDEX CONCURRENTLY "mentions_workspace_id_agent_configuration_id_created_at" ON "mentions" ("workspaceId", "agentConfigurationId", "createdAt");
