-- Migration created on May 14, 2025
CREATE INDEX CONCURRENTLY "agent_tables_query_config_table_workspace_id_data_source_id" ON "agent_tables_query_configuration_tables" ("workspaceId", "dataSourceId");
CREATE INDEX CONCURRENTLY "agent_tables_query_config_table_w_id_data_source_view_id" ON "agent_tables_query_configuration_tables" ("workspaceId", "dataSourceViewId");
CREATE INDEX CONCURRENTLY "agent_tables_query_config_table_w_id_tables_query_config_id" ON "agent_tables_query_configuration_tables" ("workspaceId", "tablesQueryConfigurationId");
