-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_dust_app_run_configurations_workspace_id_agent_configuration_id" ON "agent_dust_app_run_configurations" ("workspaceId", "agentConfigurationId");
