-- Migration created on Nov 18, 2024
ALTER TABLE "public"."files" ADD COLUMN "useCaseMetadata" JSONB DEFAULT NULL;
ALTER TABLE "public"."files" ADD COLUMN "snippet" VARCHAR(512) DEFAULT NULL;
-- Migration created on Nov 19, 2024
ALTER TABLE "public"."labs_transcripts_configurations" ADD COLUMN "isDefaultFullStorage" BOOLEAN NOT NULL DEFAULT false;
