-- Migration created on Apr 04, 2025
ALTER TABLE "public"."agent_tables_query_configuration_tables"
  ADD COLUMN "mcpServerConfigurationId" BIGINT REFERENCES "agent_mcp_server_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_tables_query_configuration_tables"
  ALTER COLUMN "tablesQueryConfigurationId" DROP NOT NULL;
