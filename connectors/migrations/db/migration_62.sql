ALTER TABLE "public"."gong_configurations" ADD COLUMN "retentionPeriodDays" INTEGER;
ALTER TABLE "gong_configurations" ALTER COLUMN "lastSyncTimestamp" SET NOT NULL;
ALTER TABLE "public"."gong_transcripts" ADD COLUMN "callDate" BIGINT;
