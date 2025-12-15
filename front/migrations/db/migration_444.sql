-- Migration created on Dec 15, 2025
ALTER TABLE "public"."skill_configurations"
    ADD COLUMN "skill_versions" TEXT;
UPDATE "public"."skill_versions"
SET "agentFacingDescription" = "description";
