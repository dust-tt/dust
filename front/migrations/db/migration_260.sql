-- Migration created on May 14, 2025
CREATE INDEX CONCURRENTLY "agent_child_agent_config_workspace_id_mcp_srv_config_id" ON "agent_child_agent_configurations" ("workspaceId", "mcpServerConfigurationId");
