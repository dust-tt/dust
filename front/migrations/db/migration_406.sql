-- Enforce RESTRICT on MCP-related foreign keys (no delete cascade)
-- Fixes https://github.com/dust-tt/tasks/issues/5083 (item 3)

-- Agent MCP server config -> Agent configuration
ALTER TABLE "agent_mcp_server_configurations"
  DROP CONSTRAINT IF EXISTS "agent_mcp_server_configurations_agentConfigurationId_fkey";
ALTER TABLE "agent_mcp_server_configurations"
  ADD CONSTRAINT "agent_mcp_server_configurations_agentConfigurationId_fkey"
    FOREIGN KEY ("agentConfigurationId")
    REFERENCES "agent_configurations"("id")
    ON DELETE RESTRICT;

-- Data source configurations -> MCP server config
ALTER TABLE "agent_data_source_configurations"
  DROP CONSTRAINT IF EXISTS "agent_data_source_configurations_mcpServerConfigurationId_fkey";
ALTER TABLE "agent_data_source_configurations"
  ADD CONSTRAINT "agent_data_source_configurations_mcpServerConfigurationId_fkey"
    FOREIGN KEY ("mcpServerConfigurationId")
    REFERENCES "agent_mcp_server_configurations"("id")
    ON DELETE RESTRICT;

-- Tables query configuration table -> MCP server config
ALTER TABLE "agent_tables_query_configuration_tables"
  DROP CONSTRAINT IF EXISTS "agent_tables_query_configuration_tables_mcpServerConfigurationId_fkey";
ALTER TABLE "agent_tables_query_configuration_tables"
  ADD CONSTRAINT "agent_tables_query_configuration_tables_mcpServerConfigurationId_fkey"
    FOREIGN KEY ("mcpServerConfigurationId")
    REFERENCES "agent_mcp_server_configurations"("id")
    ON DELETE RESTRICT;

-- Reasoning configuration -> MCP server config
ALTER TABLE "agent_reasoning_configurations"
  DROP CONSTRAINT IF EXISTS "agent_reasoning_configurations_mcpServerConfigurationId_fkey";
ALTER TABLE "agent_reasoning_configurations"
  ADD CONSTRAINT "agent_reasoning_configurations_mcpServerConfigurationId_fkey"
    FOREIGN KEY ("mcpServerConfigurationId")
    REFERENCES "agent_mcp_server_configurations"("id")
    ON DELETE RESTRICT;

-- Child agent configuration -> MCP server config
ALTER TABLE "agent_child_agent_configurations"
  DROP CONSTRAINT IF EXISTS "agent_child_agent_configurations_mcpServerConfigurationId_fkey";
ALTER TABLE "agent_child_agent_configurations"
  ADD CONSTRAINT "agent_child_agent_configurations_mcpServerConfigurationId_fkey"
    FOREIGN KEY ("mcpServerConfigurationId")
    REFERENCES "agent_mcp_server_configurations"("id")
    ON DELETE RESTRICT;

