-- Migration created on Apr 12, 2025
-- Create the group_agents table

CREATE TABLE IF NOT EXISTS "group_agents" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" BIGINT NOT NULL,
    "agentConfigurationId" BIGINT NOT NULL,
    "workspaceId" BIGINT NOT NULL,

    -- Foreign key constraints
    CONSTRAINT "group_agents_groupId_fkey"
        FOREIGN KEY ("groupId")
        REFERENCES "groups"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "group_agents_agentConfigurationId_fkey"
        FOREIGN KEY ("agentConfigurationId")
        REFERENCES "agent_configurations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "group_agents_workspaceId_fkey"
        FOREIGN KEY ("workspaceId")
        REFERENCES "workspaces"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,

    -- Unique constraint for the combination of group and agent
    CONSTRAINT "group_agents_unique_group_agent"
        UNIQUE ("groupId", "agentConfigurationId")
);

-- Index for faster lookups by agentConfigurationId
CREATE INDEX IF NOT EXISTS "group_agents_agentConfigurationId_idx" ON "group_agents"("agentConfigurationId");
