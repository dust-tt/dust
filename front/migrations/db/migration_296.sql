-- Migration created on Jul 02, 2025
ALTER TABLE "agent_reasoning_configurations" ALTER COLUMN "mcpServerConfigurationId" SET NOT NULL;
ALTER TABLE "agent_reasoning_configurations"  ADD FOREIGN KEY ("mcpServerConfigurationId") REFERENCES "agent_mcp_server_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
