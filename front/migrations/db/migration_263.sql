-- Migration created on May 14, 2025
CREATE INDEX CONCURRENTLY "agent_data_source_configurations_workspace_id_data_source_id" ON "agent_data_source_configurations" ("workspaceId", "dataSourceId");
CREATE INDEX CONCURRENTLY "agent_data_source_config_workspace_id_data_source_view_id" ON "agent_data_source_configurations" ("workspaceId", "dataSourceViewId");