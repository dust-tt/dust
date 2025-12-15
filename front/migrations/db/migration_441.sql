-- Migration created on Dec 12, 2025
ALTER TABLE "public"."skill_configurations" ADD COLUMN "agentFacingDescription" TEXT;
UPDATE "public"."skill_configurations" SET "agentFacingDescription" = "description";
