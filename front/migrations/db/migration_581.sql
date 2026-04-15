-- Migration created on Apr 15, 2026
-- Add parent columns to version snapshot tables so that
-- ProjectTodoVersionModel can extend ProjectTodoModel and
-- TakeawaysVersionModel can extend TakeawaysModel (matching
-- the SkillVersionModel pattern).

TRUNCATE "project_todo_takeaway_sources",
    "project_todo_conversations",
    "project_todos",
    "project_todo_sources",
    "takeaway_sources",
    "takeaways"

-- ── project_todo_versions ──────────────────────────────────
ALTER TABLE "project_todo_versions"
    ADD COLUMN IF NOT EXISTS "spaceId" BIGINT NOT NULL,
    ADD COLUMN IF NOT EXISTS "userId" BIGINT NOT NULL,
    ADD COLUMN IF NOT EXISTS "createdByType" VARCHAR(255) NOT NULL,
    ADD COLUMN IF NOT EXISTS "createdByUserId" BIGINT,
    ADD COLUMN IF NOT EXISTS "createdByAgentConfigurationId" VARCHAR(255);

-- ── takeaway_versions ──────────────────────────────────────
ALTER TABLE "takeaway_versions"
    ADD COLUMN IF NOT EXISTS "spaceId" BIGINT NOT NULL;
