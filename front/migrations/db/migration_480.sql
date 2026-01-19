-- Migration created on Jan 16, 2026
ALTER TABLE "public"."labs_transcripts_configurations" ADD COLUMN "status" VARCHAR(255) NOT NULL DEFAULT 'disabled';
UPDATE "public"."labs_transcripts_configurations" SET "status" = 'active' WHERE "isActive" = true;
