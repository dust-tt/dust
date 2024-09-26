-- Migration created on Sep 25, 2024
CREATE INDEX CONCURRENTLY "agent_data_source_configurations_data_source_id" ON "agent_data_source_configurations" ("dataSourceId");
CREATE INDEX CONCURRENTLY "agent_data_source_configurations_data_source_view_id" ON "agent_data_source_configurations" ("dataSourceViewId");
CREATE INDEX CONCURRENTLY "agent_data_source_configurations_process_configuration_id" ON "agent_data_source_configurations" ("processConfigurationId");
