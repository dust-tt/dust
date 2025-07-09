-- Migration created on Mar 7, 2025
ALTER TABLE "public"."gong_configurations" ADD COLUMN "lastGarbageCollectionTimestamp" BIGINT;
ALTER TABLE "public"."gong_configurations" ADD COLUMN "retentionPeriodDays" INTEGER;
ALTER TABLE "public"."gong_transcripts" ADD COLUMN "callDate" BIGINT;
