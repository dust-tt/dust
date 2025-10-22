-- Migration created on Sep 26, 2025
ALTER TABLE "public"."agent_messages" ADD COLUMN "completedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
