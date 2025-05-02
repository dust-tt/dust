-- Migration created on May 02, 2025
ALTER TABLE "public"."agent_process_configurations" ADD COLUMN "mcpServerConfigurationId" BIGINT REFERENCES "agent_mcp_server_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_process_configurations" ALTER COLUMN "agentConfigurationId" SET NOT NULL;
ALTER TABLE "agent_process_configurations"  ADD FOREIGN KEY ("agentConfigurationId") REFERENCES "agent_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
