-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_data_source_configurations_workspace_id" ON "agent_data_source_configurations" ("workspaceId");
CREATE INDEX CONCURRENTLY "agent_data_source_config_workspace_id_retrieval_config_id" ON "agent_data_source_configurations" ("workspaceId", "retrievalConfigurationId");
CREATE INDEX CONCURRENTLY "agent_data_source_config_workspace_id_process_config_id" ON "agent_data_source_configurations" ("workspaceId", "processConfigurationId");
