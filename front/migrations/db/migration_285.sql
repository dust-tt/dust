-- Migration created on Jun 25, 2025
CREATE TABLE IF NOT EXISTS "agent_data_retention" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfigurationId" BIGINT NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "retentionDays" BIGINT NULL,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "agent_data_retention_agent_configuration_id" ON "agent_data_retention" ("agentConfigurationId");
CREATE UNIQUE INDEX "agent_data_retention_unique_agent_workspace" ON "agent_data_retention" ("workspaceId", "agentConfigurationId");