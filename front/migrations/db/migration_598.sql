-- Migration created on Apr 22, 2026
-- Store the conversation model IDs that contributed to a reinforcement suggestion.

ALTER TABLE "skill_suggestions" ADD COLUMN "sourceConversationIds" BIGINT[];
COMMENT ON COLUMN "skill_suggestions"."sourceConversationIds" IS 'Array of conversation model IDs that contributed to this reinforcement suggestion.';
