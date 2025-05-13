-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_mcp_server_configurations_workspace_id_agent_configuration_id" ON "agent_mcp_server_configurations" ("workspaceId", "agentConfigurationId");
