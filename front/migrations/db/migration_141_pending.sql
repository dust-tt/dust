-- Migration created on Jan 13, 2025
CREATE TABLE IF NOT EXISTS "agent_github_get_pull_request_actions" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "owner" VARCHAR(255) NOT NULL, "repo" VARCHAR(255) NOT NULL, "pullNumber" INTEGER NOT NULL, "details" TEXT, "diff" TEXT, "functionCallId" VARCHAR(255), "functionCallName" VARCHAR(255), "step" INTEGER NOT NULL, "id"  BIGSERIAL , "agentMessageId" BIGINT NOT NULL REFERENCES "agent_messages" ("id") ON DELETE NO ACTION ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE INDEX CONCURRENTLY "agent_github_get_pull_request_actions_agent_message_id" ON "agent_github_get_pull_request_actions" ("agentMessageId");

CREATE TABLE IF NOT EXISTS "platform_actions_configurations" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "connectionId" VARCHAR(255) NOT NULL, "provider" VARCHAR(255) NOT NULL, "id"  BIGSERIAL , "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "platform_actions_configurations_workspace_id_provider" ON "platform_actions_configurations" ("workspaceId", "provider");

CREATE TABLE IF NOT EXISTS "agent_github_configurations" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "sId" VARCHAR(255) NOT NULL, "actionType" VARCHAR(255) NOT NULL, "name" VARCHAR(255), "description" TEXT, "id"  BIGSERIAL , "agentConfigurationId" BIGINT NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "agent_github_configurations_s_id" ON "agent_github_configurations" ("sId");
CREATE INDEX CONCURRENTLY "agent_github_configurations_agent_configuration_id" ON "agent_github_configurations" ("agentConfigurationId");
