-- Migration created on Apr 01, 2026
DROP INDEX IF EXISTS "triggers_workspace_id_agent_configuration_id_name";
CREATE INDEX "triggers_workspace_id_agent_configuration_id_name" ON "triggers" ("workspaceId", "agentConfigurationId", "name");
