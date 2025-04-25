-- Migration created on Apr 25, 2025
ALTER TABLE "public"."agent_reasoning_configurations"
ADD COLUMN "mcpServerConfigurationId" BIGINT REFERENCES "agent_mcp_server_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_reasoning_configurations"
ALTER COLUMN "agentConfigurationId"
DROP NOT NULL;