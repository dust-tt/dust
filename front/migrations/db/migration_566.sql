-- Migration created on Apr 08, 2026
-- Drop the skillVersionId column and its index from skill_suggestions

DROP INDEX CONCURRENTLY IF EXISTS "skill_suggestions_workspace_skill_version";

ALTER TABLE "skill_suggestions" DROP COLUMN "skillVersionId";
