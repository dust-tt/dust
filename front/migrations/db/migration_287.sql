-- Migration created on Jun 25, 2025
CREATE TABLE IF NOT EXISTS "agent_data_retentions" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentConfigurationId" TEXT NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "retentionDays" BIGINT NOT NULL CHECK ("retentionDays" > 0),
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "agent_data_retentions_agent_configuration_id" ON "agent_data_retentions" ("agentConfigurationId");
CREATE UNIQUE INDEX "agent_data_retentions_unique_agent_workspace" ON "agent_data_retentions" ("workspaceId", "agentConfigurationId");