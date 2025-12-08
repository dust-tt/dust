-- Migration created on Dec 05, 2025
-- Create the group_skills table

CREATE TABLE IF NOT EXISTS "group_skills" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" BIGINT NOT NULL,
    "skillConfigurationId" BIGINT NOT NULL,
    "workspaceId" BIGINT NOT NULL,

    -- Foreign key constraints
    CONSTRAINT "group_skills_groupId_fkey"
        FOREIGN KEY ("groupId")
        REFERENCES "groups"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "group_skills_skillConfigurationId_fkey"
        FOREIGN KEY ("skillConfigurationId")
        REFERENCES "skill_configurations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "group_skills_workspaceId_fkey"
        FOREIGN KEY ("workspaceId")
        REFERENCES "workspaces"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,

    -- Unique constraint for the combination of group and skill
    CONSTRAINT "group_skills_unique_group_skill"
        UNIQUE ("groupId", "skillConfigurationId")
);

-- Composite index to support workspace-scoped skill lookups
-- This index supports queries filtering by workspaceId and skillConfigurationId
CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_skills_workspaceId_skillConfigurationId_idx"
  ON "group_skills"("workspaceId", "skillConfigurationId");

