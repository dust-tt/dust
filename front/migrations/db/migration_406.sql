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

-- Other MCP-related FKs already defined as RESTRICT in Sequelize models.
-- No change applied here to avoid unnecessary churn.
