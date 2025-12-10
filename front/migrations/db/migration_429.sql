-- Migration created on Dec 08, 2025
-- Create the agent_skills table

CREATE TABLE IF NOT EXISTS "agent_skills" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId" BIGINT NOT NULL,
    "customSkillId" BIGINT,
    "globalSkillId" VARCHAR(255),
    "agentConfigurationId" BIGINT NOT NULL,

    -- Foreign key constraints
    CONSTRAINT "agent_skills_workspaceId_fkey"
        FOREIGN KEY ("workspaceId")
        REFERENCES "workspaces"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agent_skills_customSkillId_fkey"
        FOREIGN KEY ("customSkillId")
        REFERENCES "skill_configurations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agent_skills_agentConfigurationId_fkey"
        FOREIGN KEY ("agentConfigurationId")
        REFERENCES "agent_configurations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create indexes
-- Query optimization for fetching skills by agent
CREATE INDEX IF NOT EXISTS "agent_skills_workspace_id_agent_configuration_id"
    ON "agent_skills" ("workspaceId", "agentConfigurationId");
