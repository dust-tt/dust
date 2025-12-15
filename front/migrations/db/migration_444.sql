-- Migration created on Dec 15, 2025
ALTER TABLE "public"."skill_versions"
    ADD COLUMN "agentFacingDescription" TEXT;

UPDATE "public"."skill_versions"
SET "agentFacingDescription" = "description";

ALTER TABLE "public"."skill_versions"
    ADD COLUMN "userFacingDescription" TEXT;