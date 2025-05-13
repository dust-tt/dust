-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_process_configurations_workspace_id_agent_configuration_id" ON "agent_process_configurations" ("workspaceId", "agentConfigurationId");
