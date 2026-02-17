-- Migration created on Feb 09, 2026
ALTER TABLE "public"."templates" ADD COLUMN "userFacingDescription" TEXT;
ALTER TABLE "public"."templates" ADD COLUMN "agentFacingDescription" TEXT;
UPDATE "public"."templates" SET "userFacingDescription" = "description";
UPDATE "public"."templates" SET "agentFacingDescription" = "description";
