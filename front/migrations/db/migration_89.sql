-- Migration created on Sep 24, 2024
DROP INDEX IF EXISTS "agent_tables_query_configuration_table_unique";
CREATE UNIQUE INDEX "agent_tables_query_configuration_table_unique_dsv" ON "agent_tables_query_configuration_tables" ("dataSourceViewId", "tableId", "tablesQueryConfigurationId");
CREATE UNIQUE INDEX "agent_tables_query_configuration_table_unique_ds" ON "agent_tables_query_configuration_tables" ("dataSourceId", "tableId", "tablesQueryConfigurationId");
