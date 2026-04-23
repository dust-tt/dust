-- Migration created on Apr 23, 2026
-- Add notificationConversationId: the conversation created to notify skill editors
-- about pending reinforcement suggestions. Only set for reinforcement suggestions.

ALTER TABLE "skill_suggestions"
ADD COLUMN "notificationConversationId" BIGINT
REFERENCES "conversations" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON COLUMN "skill_suggestions"."notificationConversationId" IS 'Conversation created to notify editors about this reinforcement suggestion.';

CREATE INDEX CONCURRENTLY "idx_skill_suggestions_notification_conversation_id"
    ON "skill_suggestions" ("notificationConversationId");
