-- Migration created on Mar 26, 2025
ALTER TABLE "public"."agent_data_source_configurations"
    ADD COLUMN "mcpServerConfigurationId" BIGINT REFERENCES "agent_mcp_server_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "agent_data_source_configurations_mcp_server_configuration_id" ON "agent_data_source_configurations" ("mcpServerConfigurationId");
