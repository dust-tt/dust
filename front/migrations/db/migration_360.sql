-- Migration created on Sep 19, 2025
ALTER TABLE "public"."user_messages" ADD COLUMN "userContextMainAgentId" VARCHAR(32) DEFAULT NULL;
