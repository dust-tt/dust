-- Migration created on May 26, 2025
ALTER TABLE "public"."agent_messages" ADD COLUMN "errorMetadata" JSONB DEFAULT NULL;
