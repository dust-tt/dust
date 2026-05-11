-- Migration created on May 11, 2026
ALTER TABLE "public"."conversations"
ADD COLUMN "isRunningAgentLoop" BOOLEAN NOT NULL DEFAULT false;
