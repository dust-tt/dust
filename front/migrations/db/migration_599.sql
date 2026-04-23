-- Migration created on Apr 23, 2026
-- Migrate sourceConversationId (single FK) into sourceConversationIds (array),
-- then drop the old column, its index, and its FK constraint.

-- Copy the single FK value into the array column where it hasn't been set yet.
UPDATE "skill_suggestions"
SET "sourceConversationIds" = ARRAY["sourceConversationId"]
WHERE "sourceConversationId" IS NOT NULL
  AND "sourceConversationIds" IS NULL;

-- Drop the index on the old column.
DROP INDEX CONCURRENTLY IF EXISTS "idx_skill_suggestions_source_conversation_id";

-- Drop the old FK column.
ALTER TABLE "skill_suggestions" DROP COLUMN "sourceConversationId";
