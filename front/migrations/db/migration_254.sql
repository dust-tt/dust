-- Migration created May 13, 2025
CREATE INDEX CONCURRENTLY "tracker_data_source_configurations_workspace_id_data_source_id" ON "tracker_data_source_configurations" ("workspaceId", "dataSourceId");
