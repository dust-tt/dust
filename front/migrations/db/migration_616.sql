-- Migration created on Apr 30, 2026
CREATE TABLE IF NOT EXISTS "skill_references" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "parentSkillId" BIGINT NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "childSkillId" BIGINT NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_skill_references_parent_skill_id"
    ON "skill_references" ("parentSkillId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_skill_references_child_skill_id"
    ON "skill_references" ("childSkillId");

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "idx_skill_references_workspace_parent_child"
    ON "skill_references" ("workspaceId", "parentSkillId", "childSkillId");
