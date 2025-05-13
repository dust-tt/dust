-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_retrieval_configurations_workspace_id_agent_configuration_id" ON "agent_retrieval_configurations" ("workspaceId", "agentConfigurationId");
