-- Migration created on Nov 19, 2024
ALTER TABLE "public"."labs_transcripts_configurations" ADD COLUMN "isDefaultFullStorage" BOOLEAN NOT NULL DEFAULT false;
