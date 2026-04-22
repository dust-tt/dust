-- Migration created on Apr 22, 2026
-- Store the conversation sIds that contributed to a reinforcement suggestion.

ALTER TABLE "skill_suggestions" ADD COLUMN "sourceConversationIds" JSONB;
COMMENT ON COLUMN "skill_suggestions"."sourceConversationIds" IS 'Array of conversation sIds that contributed to this suggestion.';
