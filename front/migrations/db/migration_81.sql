-- Migration created on Sep 15, 2024
ALTER TABLE "public"."agent_tables_query_configuration_tables"
DROP COLUMN "dataSourceId";

DROP INDEX IF EXISTS agent_tables_query_configuration_table_unique;