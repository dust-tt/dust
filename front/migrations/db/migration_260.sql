-- Migration created on May 14, 2025
CREATE INDEX CONCURRENTLY "agent_child_agent_configurations_workspace_id_mcp_server_configuration_id" ON "agent_child_agent_configurations" ("workspaceId", "mcpServerConfigurationId");
