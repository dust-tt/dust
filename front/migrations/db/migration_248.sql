-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_dust_app_run_config_workspace_id_agent_config_id" ON "agent_dust_app_run_configurations" ("workspaceId", "agentConfigurationId");
