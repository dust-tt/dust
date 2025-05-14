-- Migration created on May 14, 2025
CREATE INDEX CONCURRENTLY "agent_tables_query_config_workspace_id_mcp_srv_config_id" ON "agent_tables_query_configuration_tables" ("workspaceId", "mcpServerConfigurationId");
CREATE INDEX CONCURRENTLY "agent_reasoning_config_workspace_id_mcp_srv_config_id" ON "agent_reasoning_configurations" ("workspaceId", "mcpServerConfigurationId");
CREATE INDEX CONCURRENTLY "agent_data_source_config_workspace_id_mcp_srv_config_id" ON "agent_data_source_configurations" ("workspaceId", "mcpServerConfigurationId");
