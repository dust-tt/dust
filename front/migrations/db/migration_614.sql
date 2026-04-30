-- Migration created on Apr 29, 2026
DROP INDEX CONCURRENTLY IF EXISTS "idx_skill_suggestions_group";
ALTER TABLE "skill_suggestions" DROP COLUMN IF EXISTS "groupId";
