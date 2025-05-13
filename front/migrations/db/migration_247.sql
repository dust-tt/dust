-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_tables_query_configurations_workspace_id_agent_configuration_id" ON "agent_tables_query_configurations" ("workspaceId", "agentConfigurationId");
