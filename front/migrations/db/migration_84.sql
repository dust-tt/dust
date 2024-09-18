-- Migration created on Sep 17, 2024
ALTER TABLE "public"."agent_tables_query_configuration_tables"
DROP COLUMN "dataSourceWorkspaceId";

DROP INDEX IF EXISTS "agent_tables_query_configuration_table_unique";

CREATE UNIQUE INDEX "agent_tables_query_configuration_table_unique" ON "agent_tables_query_configuration_tables" (
  "dataSourceId",
  "tableId",
  "tablesQueryConfigurationId"
);