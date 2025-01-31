-- Migration created on Jan 31, 2025
ALTER TABLE "public"."labs_transcripts_histories" ADD COLUMN "stored" BOOLEAN NOT NULL DEFAULT false;
