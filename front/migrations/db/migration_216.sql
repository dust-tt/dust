-- Migration created on Apr 17, 2025
CREATE INDEX "tag_agents_workspace_id_agent_configuration_id" ON "tag_agents" ("workspaceId", "agentConfigurationId");
