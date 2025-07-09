-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_websearch_config_workspace_id_agent_config_id" ON "agent_websearch_configurations" ("workspaceId", "agentConfigurationId");
