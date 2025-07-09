-- Migration created on May 16, 2025
CREATE INDEX "tracker_data_source_config_workspace_id_tracker_config_id_scope" ON "tracker_data_source_configurations" ("workspaceId", "trackerConfigurationId", "scope");
