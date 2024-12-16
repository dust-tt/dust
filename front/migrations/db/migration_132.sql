-- Migration created on Dec 16, 2024
ALTER TABLE "public"."agent_message_feedbacks" ADD COLUMN "conversationShared" BOOLEAN NOT NULL DEFAULT false;
