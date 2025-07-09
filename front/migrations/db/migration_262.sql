-- Migration created on May 14, 2025
ALTER TABLE "public"."agent_messages" ADD COLUMN "skipToolsValidation" BOOLEAN NOT NULL DEFAULT false;