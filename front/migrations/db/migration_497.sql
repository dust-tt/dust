-- Migration created on Jan 29, 2026
ALTER TABLE "public"."agent_messages" ADD COLUMN "prunedContext" BOOLEAN DEFAULT false;
