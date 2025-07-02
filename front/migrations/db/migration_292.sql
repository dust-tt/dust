-- Migration created on Jul 02, 2025
ALTER TABLE "public"."agent_tables_query_configuration_tables" DROP COLUMN "tablesQueryConfigurationId";
ALTER TABLE "public"."agent_tables_query_configuration_tables" ALTER COLUMN "mcpServerConfigurationId" DROP NOT NULL;
DROP INDEX IF EXISTS "agent_tables_query_configuration_table_unique_dsv";
DROP INDEX IF EXISTS "agent_tables_query_config_table_w_id_tables_query_config_id";
