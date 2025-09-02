-- Migration created on Sep 02, 2025
CREATE UNIQUE INDEX "triggers_workspace_id_agent_configuration_id_name" ON "triggers" ("workspaceId", "agentConfigurationId", "name");
