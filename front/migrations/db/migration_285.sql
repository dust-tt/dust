-- Migration created on Jun 25, 2025
CREATE TABLE IF NOT EXISTS "agent_data_retention" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentSId" TEXT NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "retentionDays" BIGINT NOT NULL CHECK ("retentionDays" > 0),
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "agent_data_retention_agent_s_id" ON "agent_data_retention" ("agentSId");
CREATE UNIQUE INDEX "agent_data_retention_unique_agent_workspace" ON "agent_data_retention" ("workspaceId", "agentSId");