-- Migration created on Apr 14, 2025
CREATE TABLE IF NOT EXISTS "tags" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "name" VARCHAR(255) NOT NULL DEFAULT 'user', "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "tags_workspace_id_name" ON "tags" ("workspaceId", "name");
CREATE TABLE IF NOT EXISTS "tag_agents" ("id"  BIGSERIAL , "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "tagId" BIGINT NOT NULL REFERENCES "tags" ("id") ON DELETE NO ACTION ON UPDATE CASCADE, "agentConfigurationId" BIGINT NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE NO ACTION ON UPDATE CASCADE, "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, UNIQUE ("tagId", "agentConfigurationId"), PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "tag_agents_tag_id_agent_configuration_id" ON "tag_agents" ("tagId", "agentConfigurationId");
CREATE INDEX "tag_agents_agent_configuration_id" ON "tag_agents" ("agentConfigurationId");
