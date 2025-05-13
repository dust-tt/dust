-- Migration created May 13, 2025
CREATE INDEX CONCURRENTLY "agent_reasoning_config_workspace_id_agent_config_id" ON "agent_reasoning_configurations" ("workspaceId", "agentConfigurationId")
