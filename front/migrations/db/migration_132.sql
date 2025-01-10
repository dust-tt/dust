-- Migration created on Dec 16, 2024
ALTER TABLE "public"."agent_message_feedbacks" ADD COLUMN "isConversationShared" BOOLEAN NOT NULL DEFAULT false;
